import { DisputeState, DisputeVoteValue, Prisma } from "@prisma/client";
import { HttpError } from "@/lib/api";
import { AuthzError, isHouseAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { syncEventToCalendar } from "@/Araf/M3.6-GoogleCalendar/calendarSync";

/**
 * M3.5 Mess Court (Conflict-Resolution State Machine) — Md. Mahidul Alam Araf.
 */

export const DISPUTE_VOTING_HOURS = 48; // 48 hours for voting

type DisputeInclude = {
  raisedBy: { select: { id: true; name: true; image: true } };
  againstUser: { select: { id: true; name: true; image: true } };
  votes: { select: { id: true; userId: true; vote: true; comment: true; user: { select: { name: true; image: true } } } };
  events: { select: { id: true; actorId: true; fromState: true; toState: true; note: true; createdAt: true; actor: { select: { name: true } } } };
};

const DISPUTE_INCLUDE = {
  raisedBy: { select: { id: true, name: true, image: true } },
  againstUser: { select: { id: true, name: true, image: true } },
  votes: { select: { id: true, userId: true, vote: true, comment: true, user: { select: { name: true, image: true } } } },
  events: { select: { id: true, actorId: true, fromState: true, toState: true, note: true, createdAt: true, actor: { select: { name: true } } } },
} as const;

export type DisputeView = Prisma.DisputeGetPayload<{ include: typeof DISPUTE_INCLUDE }>;

export type MessCourtPageData = {
  house: { id: string; name: string };
  canManageHouse: boolean;
  disputes: DisputeView[];
  activeMembers: { id: string; name: string }[];
};

export async function loadMessCourtData(userId: string, houseId: string): Promise<MessCourtPageData> {
  const [house, disputes, canManageHouse, members] = await Promise.all([
    prisma.house.findUnique({ where: { id: houseId }, select: { id: true, name: true } }),
    prisma.dispute.findMany({
      where: { houseId },
      include: DISPUTE_INCLUDE,
      orderBy: { createdAt: "desc" },
    }),
    isHouseAdmin(userId, houseId),
    prisma.houseMember.findMany({
      where: { houseId, status: "ACTIVE" },
      select: { userId: true, user: { select: { id: true, name: true } } },
    }),
  ]);

  if (!house) throw new AuthzError("No such house", 404);

  return {
    house,
    disputes,
    canManageHouse,
    activeMembers: members.map((m) => m.user),
  };
}

export type DisputeInput = {
  title: string;
  description?: string;
  category?: string;
  againstUserId?: string | null;
};

export async function raiseDispute(userId: string, houseId: string, input: DisputeInput) {
  if (!input.title || input.title.trim().length === 0) {
    throw new HttpError("Title is required", 400);
  }

  return prisma.$transaction(async (tx) => {
    const dispute = await tx.dispute.create({
      data: {
        houseId,
        raisedById: userId,
        againstUserId: input.againstUserId,
        title: input.title,
        description: input.description ?? "",
        category: input.category,
        state: DisputeState.RAISED,
        events: {
          create: {
            actorId: userId,
            toState: DisputeState.RAISED,
            note: "Dispute raised",
          },
        },
      },
      include: DISPUTE_INCLUDE,
    });
    return dispute;
  });
}

export async function advanceDisputeState(
  userId: string | null,
  houseId: string,
  disputeId: string,
  targetState: DisputeState,
  note?: string,
  resolution?: string
) {
  return prisma.$transaction(async (tx) => {
    const dispute = await tx.dispute.findUnique({
      where: { id: disputeId },
    });

    if (!dispute) throw new AuthzError("No such dispute", 404);
    if (dispute.houseId !== houseId) throw new AuthzError("Dispute belongs to another house");

    const validTransitions: Record<DisputeState, DisputeState[]> = {
      RAISED: [DisputeState.VOTING, DisputeState.ARCHIVED],
      VOTING: [DisputeState.RESOLVED, DisputeState.ESCALATED, DisputeState.ARCHIVED],
      RESOLVED: [DisputeState.ARCHIVED],
      ESCALATED: [DisputeState.RESOLVED, DisputeState.ARCHIVED],
      ARCHIVED: [],
    };

    if (!validTransitions[dispute.state].includes(targetState)) {
      throw new HttpError(`Cannot transition dispute from ${dispute.state} to ${targetState}`, 400);
    }

    const isAdmin = userId ? await isHouseAdmin(userId, houseId) : false;
    
    if (userId !== null && targetState === DisputeState.ARCHIVED) {
      if (!isAdmin && dispute.raisedById !== userId) {
        throw new AuthzError("Only admins or the creator can archive this dispute.");
      }
    }

    const updated = await tx.dispute.update({
      where: { id: disputeId },
      data: {
        state: targetState,
        resolution: resolution !== undefined ? resolution : dispute.resolution,
        events: {
          create: {
            actorId: userId,
            fromState: dispute.state,
            toState: targetState,
            note: note ?? `State changed to ${targetState}`,
          },
        },
      },
      include: DISPUTE_INCLUDE,
    });

    // M3.6 Sync: Sync voting deadline to calendar (votingDeadline is populated by DB trigger)
    if (targetState === DisputeState.VOTING && updated.votingDeadline) {
      try {
        await syncEventToCalendar(houseId, {
          sourceType: "DISPUTE",
          sourceId: updated.id,
          title: `Mess Court Deadline: ${updated.title}`,
          description: `Voting deadline for dispute "${updated.title}". Please cast your vote.`,
          startsAt: updated.votingDeadline,
          endsAt: new Date(updated.votingDeadline.getTime() + 60 * 60 * 1000),
        });
      } catch (err) {
        console.error("Failed to sync dispute deadline to calendar:", err);
      }
    }

    return updated;
  });
}

export async function castDisputeVote(
  userId: string,
  houseId: string,
  disputeId: string,
  voteValue: DisputeVoteValue,
  comment?: string
) {
  return prisma.$transaction(async (tx) => {
    const dispute = await tx.dispute.findUnique({
      where: { id: disputeId },
      select: { houseId: true, state: true, votingDeadline: true },
    });

    if (!dispute) throw new AuthzError("No such dispute", 404);
    if (dispute.houseId !== houseId) throw new AuthzError("Dispute belongs to another house");
    if (dispute.state !== DisputeState.VOTING) {
      throw new HttpError("Dispute is not in VOTING state", 400);
    }
    if (dispute.votingDeadline && dispute.votingDeadline.getTime() < Date.now()) {
      throw new HttpError("Voting deadline has passed", 400);
    }

    await tx.disputeVote.upsert({
      where: { disputeId_userId: { disputeId, userId } },
      create: {
        disputeId,
        userId,
        vote: voteValue,
        comment,
      },
      update: {
        vote: voteValue,
        comment,
      },
    });

    return tx.dispute.findUniqueOrThrow({
      where: { id: disputeId },
      include: DISPUTE_INCLUDE,
    });
  });
}

/**
 * Called by the cron job to auto-escalate disputes that passed their voting deadline.
 */
export async function checkDisputeTimeouts() {
  const expiredDisputes = await prisma.dispute.findMany({
    where: {
      state: DisputeState.VOTING,
      votingDeadline: { lt: new Date() },
    },
    select: { 
      id: true, 
      houseId: true,
      votes: { select: { vote: true } }
    },
  });

  const escalatedIds: string[] = [];
  const resolvedIds: string[] = [];
  
  for (const dispute of expiredDisputes) {
    try {
      let targetState: DisputeState = DisputeState.ESCALATED;
      let note = "Auto-escalated due to voting timeout with no consensus";
      let resolution: string | undefined = undefined;

      // Tally votes
      let forVotes = 0;
      let againstVotes = 0;
      for (const v of dispute.votes) {
        if (v.vote === DisputeVoteValue.FOR) forVotes++;
        if (v.vote === DisputeVoteValue.AGAINST) againstVotes++;
      }

      // Simple consensus rule: if FOR > AGAINST, resolve FOR. If AGAINST > FOR, resolve AGAINST.
      // If TIE or 0 votes, ESCALATE.
      if (forVotes > againstVotes) {
        targetState = DisputeState.RESOLVED;
        note = "Auto-resolved (Consensus: FOR)";
        resolution = "Resolved in favor based on community votes.";
      } else if (againstVotes > forVotes) {
        targetState = DisputeState.RESOLVED;
        note = "Auto-resolved (Consensus: AGAINST)";
        resolution = "Resolved against based on community votes.";
      }

      await advanceDisputeState(
        null, // System actor
        dispute.houseId,
        dispute.id,
        targetState,
        note,
        resolution
      );

      if (targetState === DisputeState.ESCALATED) {
        escalatedIds.push(dispute.id);
      } else {
        resolvedIds.push(dispute.id);
      }
    } catch (e) {
      console.error(`Failed to auto-process dispute ${dispute.id}:`, e);
    }
  }
  return [...escalatedIds, ...resolvedIds];
}
