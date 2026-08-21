/**
 * Demo data for a live walkthrough.
 *
 * Safe to re-run: it deletes its own data first (identified by the
 * @demo.example.com email domain and the fixed house names), so you can reset
 * to a known state right before presenting.
 *
 *   npm run db:seed
 *
 * Writes go through Prisma, so the database TRIGGERS still fire — the bKash
 * payment really does flip its ledger row to PAID, and the disputes really are
 * walked through the state machine rather than inserted in their final state.
 */

import {
  PrismaClient,
  type GuestPolicy,
  type PreferenceWeight,
  type RoomType,
  type SleepSchedule,
  type UserRole,
} from "@prisma/client";
import bcrypt from "bcryptjs";

import { mondayOf } from "../lib/menu";

const prisma = new PrismaClient();

const DOMAIN = "demo.example.com";
const PASSWORD = "DemoPass123!";

const PEOPLE: { key: string; name: string; role: UserRole; phone: string }[] = [
  { key: "admin", name: "Ayesha Rahman", role: "ADMIN", phone: "01711000001" },
  { key: "miftelul", name: "Miftelul Mehebub", role: "LANDLORD", phone: "01711000002" },
  { key: "rahim", name: "Rahim Uddin", role: "LANDLORD", phone: "01711000003" },
  { key: "nusrat", name: "Nusrat Jahan", role: "RESIDENT", phone: "01711000004" },
  { key: "tanvir", name: "Tanvir Ahmed", role: "RESIDENT", phone: "01711000005" },
  { key: "sadia", name: "Sadia Islam", role: "RESIDENT", phone: "01711000006" },
  { key: "arif", name: "Arif Hossain", role: "RESIDENT", phone: "01711000007" },
  { key: "moinul", name: "Moinul Islam", role: "RESIDENT", phone: "01711000010" },
  { key: "farhana", name: "Farhana Akter", role: "RESIDENT", phone: "01711000011" },
];

const HOUSES = [
  { key: "bashundhara", name: "Bashundhara Mess", owner: "miftelul", area: "Bashundhara", address: "House 12, Road 5, Block B", lat: 23.8103, lng: 90.4125 },
  { key: "merul", name: "Merul Badda Bachelor Mess", owner: "miftelul", area: "Merul Badda", address: "House 44, Anandanagar", lat: 23.7806, lng: 90.4258 },
  { key: "banani", name: "Banani Heights", owner: "rahim", area: "Banani", address: "Flat 5B, Road 11", lat: 23.7936, lng: 90.4043 },
  { key: "mohakhali", name: "Mohakhali Flat Share", owner: "rahim", area: "Mohakhali", address: "House 7, Wireless Gate", lat: 23.7783, lng: 90.4048 },
  { key: "uttara", name: "Uttara Student Home", owner: "rahim", area: "Uttara", address: "House 22, Sector 10", lat: 23.8759, lng: 90.3795 },
  { key: "dhanmondi", name: "Dhanmondi Ladies Hostel", owner: "miftelul", area: "Dhanmondi", address: "House 9, Road 27", lat: 23.7461, lng: 90.3742 },
];

// 1 (relaxed) - 5 (very tidy) — same scale the matching engine uses.
type L = {
  house: string; title: string; rent: number; type: RoomType; cap: number; amenities: string[];
  sleep: SleepSchedule | null; clean: number | null; smoking: boolean | null;
  pets: boolean | null; desc: string; inactive?: boolean;
};

const LISTINGS: L[] = [
  { house: "bashundhara", title: "Single room near BRAC University", rent: 9000, type: "SINGLE", cap: 1, amenities: ["wifi", "attached bath", "generator"], sleep: "EARLY_BIRD", clean: 5, smoking: false, pets: false, desc: "Furnished single with attached bath. Five minutes' walk to campus, 24/7 generator backup." },
  { house: "bashundhara", title: "Shared twin room, Bashundhara", rent: 6500, type: "SHARED", cap: 2, amenities: ["wifi", "fridge", "balcony"], sleep: "FLEXIBLE", clean: 3, smoking: false, pets: false, desc: "Twin sharing with a balcony. Fridge and water filter included." },
  { house: "merul", title: "Seat in 4-seater, meals included", rent: 5500, type: "SEAT", cap: 4, amenities: ["wifi", "meals", "fridge"], sleep: "NIGHT_OWL", clean: 3, smoking: true, pets: false, desc: "Budget seat with three meals a day from the house cook." },
  { house: "merul", title: "Master bedroom with balcony", rent: 12000, type: "MASTER", cap: 2, amenities: ["wifi", "balcony", "generator"], sleep: "FLEXIBLE", clean: 3, smoking: false, pets: false, desc: "Spacious master bedroom, suitable for two people sharing." },
  { house: "banani", title: "Master bedroom, Banani", rent: 18000, type: "MASTER", cap: 2, amenities: ["wifi", "lift", "parking", "balcony"], sleep: "FLEXIBLE", clean: 5, smoking: false, pets: true, desc: "Premium master with attached bath, lift and parking. Pet friendly." },
  { house: "banani", title: "Single room, Banani (quiet floor)", rent: 14000, type: "SINGLE", cap: 1, amenities: ["wifi", "lift", "security"], sleep: "EARLY_BIRD", clean: 5, smoking: false, pets: false, desc: "Quiet corner room on the fourth floor. 24-hour security." },
  { house: "mohakhali", title: "Entire 2-bed flat, Mohakhali", rent: 26000, type: "ENTIRE_FLAT", cap: 4, amenities: ["wifi", "lift", "security", "parking"], sleep: "FLEXIBLE", clean: 3, smoking: false, pets: false, desc: "Whole flat — ideal for a small mess of three or four." },
  { house: "mohakhali", title: "Seat in 3-seater, Mohakhali", rent: 6000, type: "SEAT", cap: 3, amenities: ["wifi", "meals"], sleep: "NIGHT_OWL", clean: 1, smoking: true, pets: false, desc: "Affordable seat close to the bus stand." },
  { house: "uttara", title: "Budget single room, Uttara", rent: 7500, type: "SINGLE", cap: 1, amenities: ["wifi", "generator"], sleep: "NIGHT_OWL", clean: 1, smoking: true, pets: false, desc: "Simple single room, walking distance to Uttara Sector 10 market." },
  { house: "uttara", title: "Shared room, Uttara Sector 10", rent: 5000, type: "SHARED", cap: 2, amenities: ["wifi"], sleep: "FLEXIBLE", clean: 3, smoking: false, pets: false, desc: "Cheapest option on the platform. Basic but clean." },
  { house: "dhanmondi", title: "Single seat, Dhanmondi (ladies)", rent: 8500, type: "SEAT", cap: 1, amenities: ["wifi", "meals", "security"], sleep: "EARLY_BIRD", clean: 5, smoking: false, pets: false, desc: "Ladies-only hostel with meals and a strict 10pm gate time." },
  { house: "dhanmondi", title: "Old seat, Dhanmondi (no longer available)", rent: 4500, type: "SINGLE", cap: 1, amenities: ["wifi"], sleep: null, clean: null, smoking: null, pets: null, desc: "Taken down by the landlord. Kept to demonstrate a delisted property — it stays out of search, but saved shortlists and past applications survive.", inactive: true },
];

const SETTINGS = [
  { key: "platform_name", value: "Smart Mess", description: "Name shown in the navigation bar and page titles." },
  { key: "signups_enabled", value: true, description: "When false, the sign-up form is hidden and new registrations are refused." },
  { key: "dispute_voting_hours", value: 48, description: "Hours a Mess Court dispute stays open for voting before auto-escalating (M3.5)." },
  { key: "guest_max_nights", value: 7, description: "Longest guest stay a resident may log without house admin approval (M1.3)." },
  { key: "maintenance_mode", value: false, description: "When true, the app is read-only for everyone except platform admins." },
];

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

const W = (v: PreferenceWeight = "MEDIUM") => v;

async function main() {
  console.log("Clearing previous demo data…");
  // Houses cascade to listings, members, expenses, tickets and disputes.
  await prisma.house.deleteMany({ where: { name: { in: HOUSES.map((h) => h.name) } } });
  const removed = await prisma.user.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });
  if (removed.count) console.log(`  removed ${removed.count} previous demo user(s)`);

  console.log("Seeding platform settings…");
  for (const s of SETTINGS) {
    await prisma.platformSetting.upsert({
      where: { key: s.key },
      create: { key: s.key, value: s.value, description: s.description },
      update: { description: s.description },
    });
  }

  console.log("Creating users…");
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const ids: Record<string, string> = {};
  for (const p of PEOPLE) {
    const user = await prisma.user.create({
      data: {
        email: `${p.key}@${DOMAIN}`,
        name: p.name,
        role: p.role,
        phone: p.phone,
        passwordHash,
        emailVerified: new Date(),
      },
    });
    ids[p.key] = user.id;
  }
  console.log(`  ${PEOPLE.length} users`);

  console.log("Creating houses…");
  const houseIds: Record<string, string> = {};
  for (const h of HOUSES) {
    const house = await prisma.house.create({
      data: {
        name: h.name, address: h.address, area: h.area,
        latitude: h.lat, longitude: h.lng, landlordId: ids[h.owner],
        members: {
          create: { userId: ids[h.owner], role: "LANDLORD", isHouseAdmin: true, status: "ACTIVE" },
        },
      },
    });
    houseIds[h.key] = house.id;
  }

  // The first resident into a house becomes its flat admin — the person who
  // runs the household and may advertise a spare seat. Later joiners are
  // ordinary residents. joinedAt is staggered so the Post-Move-In Feedback
  // Window has a realistic "who moved in when" order to check eligibility against.
  await prisma.houseMember.createMany({
    data: [
      { houseId: houseIds.bashundhara, userId: ids.nusrat, role: "RESIDENT", status: "ACTIVE", isHouseAdmin: true, joinedAt: daysAgo(60) },
      { houseId: houseIds.bashundhara, userId: ids.tanvir, role: "RESIDENT", status: "ACTIVE", joinedAt: daysAgo(5) },
      { houseId: houseIds.banani, userId: ids.sadia, role: "RESIDENT", status: "ACTIVE", isHouseAdmin: true, joinedAt: daysAgo(90) },
    ],
  });
  console.log(`  ${HOUSES.length} houses, 3 residents placed`);

  console.log("Creating listings…");
  const listingIds: string[] = [];
  for (const l of LISTINGS) {
    const h = HOUSES.find((x) => x.key === l.house)!;
    const listing = await prisma.listing.create({
      data: {
        landlordId: ids[h.owner], houseId: houseIds[l.house],
        title: l.title, description: l.desc, rent: l.rent,
        area: h.area, address: h.address, roomType: l.type, capacity: l.cap,
        amenities: l.amenities, latitude: h.lat, longitude: h.lng,
        sleepSchedule: l.sleep, cleanlinessLevel: l.clean,
        allowsSmoking: l.smoking, allowsPets: l.pets, isActive: !l.inactive,
      },
    });
    listingIds.push(listing.id);
  }
  console.log(`  ${LISTINGS.length} listings (1 delisted)`);

  console.log("Creating preferences (with custom weighting)…");
  await prisma.preference.createMany({
    data: [
      {
        userId: ids.nusrat, budgetMin: 6000, budgetMax: 10000, sleepSchedule: "EARLY_BIRD",
        cleanlinessLevel: 5, noiseTolerance: 2, guestPolicy: "RARELY", smokingOk: false, petsOk: false,
        preferredArea: "Bashundhara", cleanlinessWeight: W("HIGH"), smokingWeight: W("MUST_HAVE"),
      },
      {
        userId: ids.tanvir, budgetMin: 5000, budgetMax: 8000, sleepSchedule: "NIGHT_OWL",
        cleanlinessLevel: 2, noiseTolerance: 4, guestPolicy: "FREQUENTLY", smokingOk: true, petsOk: false,
        preferredArea: "Merul Badda", noiseWeight: W("LOW"),
      },
      {
        userId: ids.sadia, budgetMin: 12000, budgetMax: 20000, sleepSchedule: "FLEXIBLE",
        cleanlinessLevel: 5, noiseTolerance: 3, guestPolicy: "OCCASIONALLY", smokingOk: false, petsOk: true,
        preferredArea: "Banani", petsWeight: W("HIGH"),
      },
      {
        userId: ids.arif, budgetMin: 5000, budgetMax: 9000, sleepSchedule: "FLEXIBLE",
        cleanlinessLevel: 3, noiseTolerance: 3, guestPolicy: "OCCASIONALLY", smokingOk: false, petsOk: false,
        preferredArea: null,
      },
      {
        // Deliberately mismatched vs. everyone else, and MUST_HAVE on a
        // budget nobody else is near — demonstrates the hard-dealbreaker cap.
        userId: ids.moinul, budgetMin: 40000, budgetMax: 50000, sleepSchedule: "NIGHT_OWL",
        cleanlinessLevel: 1, noiseTolerance: 5, guestPolicy: "FREQUENTLY", smokingOk: true, petsOk: true,
        preferredArea: "Gulshan", budgetWeight: W("MUST_HAVE"),
      },
      {
        // Close match to arif — used to demo User<->User matching + a mutual
        // RoommateMatchRequest below.
        userId: ids.farhana, budgetMin: 5500, budgetMax: 9500, sleepSchedule: "FLEXIBLE",
        cleanlinessLevel: 3, noiseTolerance: 3, guestPolicy: "OCCASIONALLY", smokingOk: false, petsOk: false,
        preferredArea: null,
      },
    ],
  });

  await prisma.favorite.createMany({
    data: [
      { userId: ids.nusrat, listingId: listingIds[0] },
      { userId: ids.nusrat, listingId: listingIds[1] },
      { userId: ids.sadia, listingId: listingIds[4] },
      { userId: ids.arif, listingId: listingIds[2] },
      { userId: ids.arif, listingId: listingIds[8] },
    ],
  });

  await prisma.joinRequest.createMany({
    data: [
      { userId: ids.arif, listingId: listingIds[2], status: "PENDING", message: "Hi, I'm a CSE student at BRACU. Could I take the remaining seat?" },
      { userId: ids.tanvir, listingId: listingIds[8], status: "PENDING", message: "Is the room still available from next month?" },
      { userId: ids.nusrat, listingId: listingIds[0], status: "ACCEPTED", message: "I'd like to move in from the 1st." },
    ],
  });
  console.log("  6 preference profiles, 5 favourites, 3 join requests");

  console.log("Creating a mutual roommate match request (arif <-> farhana)…");
  await prisma.roommateMatchRequest.create({
    data: {
      senderId: ids.arif,
      receiverId: ids.farhana,
      status: "ACCEPTED",
      message: "Our budgets and schedules look really close — want to look for a place together?",
    },
  });
  await prisma.message.createMany({
    data: [
      { senderId: ids.arif, recipientId: ids.farhana, body: "Hey! Our preferences overlap a lot — thinking of teaming up on a search?" },
      { senderId: ids.farhana, recipientId: ids.arif, body: "Yes, I saw that too. Happy to look at listings together." },
    ],
  });

  console.log("Creating a block + a report (Report & Block safety system)…");
  await prisma.userBlock.create({ data: { blockerId: ids.sadia, blockedId: ids.moinul } });
  await prisma.report.create({
    data: {
      reporterId: ids.arif,
      targetType: "ROOMMATE_POST",
      targetId: listingIds[0],
      reason: "Spam — same post copy-pasted across five listings.",
      status: "OPEN",
    },
  });

  console.log("Creating a verified profile badge…");
  await prisma.verificationRequest.create({
    data: {
      userId: ids.arif,
      phone: "01711000007",
      note: "BRACU student ID attached.",
      status: "VERIFIED",
      reviewedById: ids.admin,
      reviewedAt: daysAgo(2),
    },
  });
  await prisma.verificationRequest.create({
    data: { userId: ids.tanvir, phone: "01711000005", status: "PENDING" },
  });

  console.log("Creating roommate posts…");
  const nusratPost = await prisma.roommatePost.create({
    data: {
      houseId: houseIds.bashundhara,
      postedById: ids.nusrat,
      title: "Spare seat in a quiet 3-person flat",
      description:
        "Two of us are final-year students. Kitchen and living room shared, quiet after 11pm, cleaner comes twice a week.",
      monthlyShare: 6200,
      seatsAvailable: 1,
      availableFrom: new Date(Date.now() + 14 * 86_400_000),
      sleepSchedule: "EARLY_BIRD",
      cleanlinessLevel: 5,
      smokingOk: false,
      petsOk: false,
    },
  });
  await prisma.roommatePost.create({
    data: {
      houseId: houseIds.banani,
      postedById: ids.sadia,
      title: "Room going in Banani flat share",
      description: "Furnished room in a lift building. Two working professionals already here.",
      monthlyShare: 15000,
      seatsAvailable: 1,
      sleepSchedule: "FLEXIBLE",
      cleanlinessLevel: 5,
      smokingOk: false,
      petsOk: true,
    },
  });
  await prisma.roommateApplication.create({
    data: {
      postId: nusratPost.id,
      userId: ids.arif,
      status: "PENDING",
      message: "I'm quiet, tidy and around campus most days. Could I come and see it?",
    },
  });
  console.log("  2 spare seats advertised, 1 applicant waiting");

  console.log("Creating maintenance tickets…");
  const tickets = await Promise.all([
    prisma.maintenanceTicket.create({ data: { houseId: houseIds.bashundhara, reportedById: ids.nusrat, title: "Leaking tap in the kitchen", description: "Constant drip, wasting water and keeping people awake.", category: "Plumbing", status: "OPEN", priority: "HIGH" } }),
    prisma.maintenanceTicket.create({ data: { houseId: houseIds.bashundhara, reportedById: ids.tanvir, assignedToId: ids.miftelul, title: "Ceiling fan making noise", description: "Second-floor room fan rattles on high speed.", category: "Electrical", status: "OPEN", priority: "MEDIUM" } }),
    prisma.maintenanceTicket.create({ data: { houseId: houseIds.bashundhara, reportedById: ids.nusrat, title: "Wi-Fi router keeps dropping", description: "Disconnects every evening around 9pm.", category: "Internet", status: "OPEN", priority: "LOW" } }),
  ]);

  // Every ticket opens with a "Reported" row, matching what POST /api/maintenance
  // writes. Without it the three seeded tickets demo with an empty history
  // panel while anything reported live has one, which reads as a broken feature.
  await prisma.maintenanceTicketEvent.createMany({
    data: tickets.map((t) => ({
      ticketId: t.id,
      actorId: t.reportedById,
      toStatus: "OPEN" as const,
      note: "Reported",
      createdAt: t.createdAt,
    })),
  });

  // Move them through their statuses, writing the history rows the way the app
  // does now (triggers can no longer record who acted).
  for (const [ticket, states, actor] of [
    [tickets[1], ["IN_PROGRESS"], ids.miftelul],
    [tickets[2], ["IN_PROGRESS", "RESOLVED"], ids.miftelul],
  ] as const) {
    let from = ticket.status;
    for (const to of states) {
      await prisma.$transaction([
        prisma.maintenanceTicket.update({ where: { id: ticket.id }, data: { status: to } }),
        prisma.maintenanceTicketEvent.create({ data: { ticketId: ticket.id, actorId: actor, fromStatus: from, toStatus: to } }),
      ]);
      from = to;
    }
  }
  console.log("  3 tickets (1 open, 1 in progress, 1 resolved)");

  console.log("Creating shared expenses…");
  const electricity = await prisma.expense.create({
    data: {
      // Logged by the landlord, but Nusrat is the one who actually paid the
      // bill — so her own share is settled from the start and the house owes
      // her, not the other way round.
      houseId: houseIds.bashundhara, createdById: ids.miftelul, paidById: ids.nusrat,
      title: "August electricity bill", description: "Meter reading 4102 units.",
      amount: 3200, category: "UTILITIES", splitMethod: "EQUAL", spentOn: daysAgo(6),
      shares: {
        create: [
          { userId: ids.nusrat, amount: 1600, status: "PAID", settledAt: daysAgo(6) },
          { userId: ids.tanvir, amount: 1600 },
        ],
      },
    },
    include: { shares: true },
  });
  await prisma.expense.create({
    data: {
      houseId: houseIds.bashundhara, createdById: ids.nusrat, paidById: ids.nusrat,
      title: "Groceries — first week", description: "Rice, lentils, oil, vegetables.",
      amount: 4500, category: "GROCERIES", splitMethod: "EQUAL", spentOn: daysAgo(3),
      shares: {
        create: [
          { userId: ids.nusrat, amount: 2250, status: "PAID", settledAt: daysAgo(3) },
          { userId: ids.tanvir, amount: 2250 },
        ],
      },
    },
  });

  // Insert as INITIATED then advance to SUCCEEDED, so the payments trigger
  // fires and really does flip the ledger row — the path a verified webhook takes.
  // Tanvir reimburses Nusrat for his half of the electricity through the app.
  const tanvirShare = electricity.shares.find((s) => s.userId === ids.tanvir)!;
  const payment = await prisma.payment.create({
    data: {
      userId: ids.tanvir, houseId: houseIds.bashundhara, expenseShareId: tanvirShare.id,
      provider: "BKASH", status: "INITIATED", amount: 1600, currency: "BDT",
      providerPaymentId: `demo-bkash-${Date.now()}`,
    },
  });
  await prisma.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED" } });
  const settled = await prisma.expenseShare.findUnique({ where: { id: tanvirShare.id } });
  const trail = await prisma.expenseShareEvent.count({ where: { shareId: tanvirShare.id } });
  console.log("  2 expenses, 4 shares, 1 bKash payment — ledger row is now " + settled?.status + ", " + trail + " audit event(s)");

  console.log("Creating a week of daily meal-vote demo data (M2.2)…");
  await prisma.user.update({ where: { id: ids.nusrat }, data: { dietaryRestrictions: ["VEGETARIAN"] } });
  await prisma.house.update({
    where: { id: houseIds.bashundhara },
    data: { defaultSafeMeal: "Plain rice, dal, and a boiled egg" },
  });

  const thisMonday = mondayOf(new Date());

  // Monday (day 0): already decided — nusrat's candidate won.
  const mondayWinner = await prisma.dayProposal.create({
    data: {
      houseId: houseIds.bashundhara, proposedById: ids.nusrat,
      weekStartDate: thisMonday, dayOfWeek: 0,
      breakfast: "Porota and dim bhaji", lunch: "Bhat, dal, aloo bhorta, mixed vegetable",
      dinner: "Vegetable khichuri", estimatedCostPerHead: 110, nutritionProfile: "BALANCED",
      dietaryTags: ["VEGETARIAN"],
    },
  });
  await prisma.dayProposal.create({
    data: {
      houseId: houseIds.bashundhara, proposedById: ids.tanvir,
      weekStartDate: thisMonday, dayOfWeek: 0,
      lunch: "Bhat, murgi curry", dinner: "Bhuna khichuri with egg",
      estimatedCostPerHead: 140, nutritionProfile: "PROTEIN_HEAVY",
    },
  });
  await prisma.dailyMealResult.create({
    data: {
      houseId: houseIds.bashundhara, weekStartDate: thisMonday, dayOfWeek: 0,
      status: "DECIDED", winningProposalId: mondayWinner.id, decidedAt: new Date(),
    },
  });

  // Tuesday (day 1): voting still in progress — two candidates, one ballot
  // cast so far. Tanvir's candidate has no VEGETARIAN tag, so it'll show as
  // hidden on nusrat's own ballot (dietary filter enhancement).
  const tueA = await prisma.dayProposal.create({
    data: {
      houseId: houseIds.bashundhara, proposedById: ids.nusrat,
      weekStartDate: thisMonday, dayOfWeek: 1,
      breakfast: "Ruti and vegetable curry", lunch: "Bhat, dal, fish curry",
      estimatedCostPerHead: 130, nutritionProfile: "BALANCED", dietaryTags: ["VEGETARIAN"],
    },
  });
  const tueB = await prisma.dayProposal.create({
    data: {
      houseId: houseIds.bashundhara, proposedById: ids.tanvir,
      weekStartDate: thisMonday, dayOfWeek: 1,
      lunch: "Bhat, beef bhuna", dinner: "Paratha and chicken curry",
      estimatedCostPerHead: 160, nutritionProfile: "PROTEIN_HEAVY", dietaryTags: ["NO_PORK"],
    },
  });
  const tueResult = await prisma.dailyMealResult.create({
    data: { houseId: houseIds.bashundhara, weekStartDate: thisMonday, dayOfWeek: 1, status: "OPEN" },
  });
  const tanvirBallot = await prisma.dailyBallot.create({
    data: { resultId: tueResult.id, voterId: ids.tanvir, round: "MAIN" },
  });
  await prisma.dailyBallotRanking.createMany({
    data: [
      { ballotId: tanvirBallot.id, proposalId: tueB.id, rank: 1 },
      { ballotId: tanvirBallot.id, proposalId: tueA.id, rank: 2 },
    ],
  });

  // Wednesday (day 2): nobody proposed anything — falls back to the house's
  // default safe meal.
  await prisma.dailyMealResult.create({
    data: {
      houseId: houseIds.bashundhara, weekStartDate: thisMonday, dayOfWeek: 2,
      status: "FALLBACK", fallbackReason: "no_candidates", decidedAt: new Date(),
    },
  });

  console.log("  1 decided day, 1 in-progress ranked ballot, 1 fallback-to-safe-meal day");

  console.log("Creating Mess Court disputes…");
  const mk = (raisedBy: string, against: string, title: string, description: string, category: string) =>
    prisma.dispute.create({ data: { houseId: houseIds.bashundhara, raisedById: raisedBy, againstUserId: against, title, description, category, state: "RAISED" } });

  await mk(ids.nusrat, ids.tanvir, "Unpaid grocery share", "Grocery share from the first week is still outstanding.", "Money");
  const noise = await mk(ids.tanvir, ids.nusrat, "Loud music after midnight", "Music from the front room past 1am on weeknights.", "Noise");
  const rent = await mk(ids.miftelul, ids.tanvir, "Repeated late rent payments", "Rent has been more than a week late three months running.", "Money");

  // Legal transitions only — the state machine trigger rejects anything else.
  await prisma.dispute.update({ where: { id: noise.id }, data: { state: "VOTING" } });
  await prisma.disputeVote.createMany({
    data: [
      { disputeId: noise.id, userId: ids.nusrat, vote: "AGAINST", comment: "It was one night, and it was a birthday." },
      { disputeId: noise.id, userId: ids.tanvir, vote: "FOR", comment: "It has happened several times." },
    ],
  });
  await prisma.dispute.update({ where: { id: rent.id }, data: { state: "VOTING" } });
  await prisma.dispute.update({ where: { id: rent.id }, data: { state: "ESCALATED" } });
  console.log("  3 disputes — 1 raised, 1 voting, 1 escalated (waiting for an admin)");

  // Post-Move-In Feedback Window demo: nusrat (joined 60 days ago) can file
  // a profile complaint about tanvir (joined 5 days ago — window still open).
  await prisma.dispute.create({
    data: {
      houseId: houseIds.bashundhara,
      raisedById: ids.nusrat,
      againstUserId: ids.tanvir,
      title: "Not as tidy as the profile said",
      description: "Preferences said cleanliness 4-5, but common areas are left messy most days.",
      category: "PROFILE_DISHONESTY",
      state: "RAISED",
    },
  });
  console.log("  1 post-move-in profile complaint (RAISED, awaiting admin review)");

  /* ── M2.4 Shared House Map & Neighbourhood Knowledge Base ─────────────── */

  console.log("Creating the neighbourhood map (M2.4)…");

  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

  // Without a confirmed pin the feature keeps distance and routing switched off
  // and asks the admin to place one — so a demo without this shows only the
  // "place your house first" empty state, never the map itself.
  await prisma.house.update({
    where: { id: houseIds.bashundhara },
    data: { mapPinSetAt: daysAgo(58), mapPinSetById: ids.nusrat },
  });

  // Real coordinates a short walk from the Bashundhara house pin, so the
  // distances the board renders are plausible rather than random.
  const PLACES = [
    { name: "Bashundhara Kacha Bazar", category: "KACHA_BAZAR" as const, lat: 23.8138, lng: 90.4192, address: "Block C main road", confirmed: 2 },
    { name: "Shwapno Superstore", category: "GROCERY" as const, lat: 23.8121, lng: 90.4165, address: "Block B, Road 3", confirmed: 6 },
    { name: "Rahim's Meat Shop", category: "BUTCHER" as const, lat: 23.8144, lng: 90.4188, address: "Beside the kacha bazar", confirmed: 12 },
    { name: "Padma Fish Corner", category: "FISH" as const, lat: 23.8141, lng: 90.4190, address: "Kacha bazar, north aisle", confirmed: 12 },
    { name: "Lazz Pharma", category: "PHARMACY" as const, lat: 23.8109, lng: 90.4149, address: "Block A, Road 1", confirmed: 3 },
    { name: "Star Gents Parlour", category: "BARBER" as const, lat: 23.8096, lng: 90.4137, address: "Block B, Road 6", confirmed: 30 },
    { name: "Nazma Tailors", category: "TAILOR" as const, lat: 23.8088, lng: 90.4118, address: "Block D, Road 2", confirmed: 45 },
    { name: "Speed Laundry", category: "LAUNDRY" as const, lat: 23.8114, lng: 90.4172, address: "Block B, Road 4", confirmed: 8 },
    { name: "Bashundhara Hardware", category: "HARDWARE" as const, lat: 23.8152, lng: 90.4205, address: "Gate 2 approach road", confirmed: 60 },
    { name: "Omera Gas Cylinder Supply", category: "GAS_CYLINDER" as const, lat: 23.8161, lng: 90.4211, address: "Delivers to the door", confirmed: 15 },
    { name: "Fresh Water Jar Service", category: "WATER" as const, lat: 23.8130, lng: 90.4180, address: "Call for delivery", confirmed: 4 },
    { name: "Sultan's Dine", category: "RESTAURANT" as const, lat: 23.8105, lng: 90.4154, address: "Block A, Road 2", confirmed: 9 },
    { name: "DBBL ATM (Gate 1)", category: "ATM" as const, lat: 23.8099, lng: 90.4131, address: "Beside the main gate", confirmed: 1 },
    { name: "CNG stand, Gate 1", category: "TRANSPORT" as const, lat: 23.8094, lng: 90.4127, address: "Main gate approach", confirmed: 1 },
  ];

  const bookmarkIds: Record<string, string> = {};
  for (const [i, place] of PLACES.entries()) {
    // Alternated so the board demonstrates attribution surviving different
    // authors rather than every pin reading "added by Nusrat".
    const author = i % 3 === 0 ? ids.tanvir : ids.nusrat;
    const authorName = i % 3 === 0 ? "Tanvir Hasan" : "Nusrat Jahan";
    const bookmark = await prisma.bookmark.create({
      data: {
        houseId: houseIds.bashundhara,
        name: place.name,
        category: place.category,
        visibility: "HOUSE",
        latitude: place.lat,
        longitude: place.lng,
        address: place.address,
        addedById: author,
        addedByName: authorName,
        lastConfirmedAt: daysAgo(place.confirmed),
        createdAt: daysAgo(place.confirmed + 10),
      },
    });
    bookmarkIds[place.category] = bookmark.id;
    if (place.name === "Shwapno Superstore") bookmarkIds.shwapno = bookmark.id;
    if (place.name === "Bashundhara Kacha Bazar") bookmarkIds.bazar = bookmark.id;
    if (place.name === "Lazz Pharma") bookmarkIds.pharmacy = bookmark.id;
    if (place.name === "Nazma Tailors") bookmarkIds.tailor = bookmark.id;
  }

  // One PRIVATE pin, so the visibility rule is demonstrable: Tanvir sees it,
  // Nusrat does not — not even as flat admin.
  await prisma.bookmark.create({
    data: {
      houseId: houseIds.bashundhara, name: "My physiotherapist", category: "SERVICE",
      visibility: "PRIVATE", latitude: 23.8072, longitude: 90.4101,
      address: "Block E, Road 4", addedById: ids.tanvir, addedByName: "Tanvir Hasan",
      lastConfirmedAt: daysAgo(20), createdAt: daysAgo(25),
    },
  });

  // One soft-deleted pin, so "removed places" and the restore path have
  // something behind them.
  await prisma.bookmark.create({
    data: {
      houseId: houseIds.bashundhara, name: "Old tea stall (closed down)", category: "RESTAURANT",
      visibility: "HOUSE", latitude: 23.8117, longitude: 90.4159,
      addedById: ids.nusrat, addedByName: "Nusrat Jahan",
      createdAt: daysAgo(120), deletedAt: daysAgo(9),
    },
  });

  // A second house gets its own map, which is what makes the house-scoping
  // visible: signed in as Sadia you see Banani's places and none of these.
  await prisma.house.update({
    where: { id: houseIds.banani },
    data: { mapPinSetAt: daysAgo(80), mapPinSetById: ids.sadia },
  });
  await prisma.bookmark.createMany({
    data: [
      { houseId: houseIds.banani, name: "Banani Kacha Bazar", category: "KACHA_BAZAR", latitude: 23.7948, longitude: 90.4061, address: "Road 11", addedById: ids.sadia, addedByName: "Sadia Islam", lastConfirmedAt: daysAgo(5) },
      { houseId: houseIds.banani, name: "Unimart Banani", category: "GROCERY", latitude: 23.7929, longitude: 90.4035, address: "Kemal Ataturk Ave", addedById: ids.sadia, addedByName: "Sadia Islam", lastConfirmedAt: daysAgo(2) },
      { houseId: houseIds.banani, name: "Banani Pharmacy", category: "PHARMACY", latitude: 23.7941, longitude: 90.4050, address: "Road 17", addedById: ids.sadia, addedByName: "Sadia Islam", lastConfirmedAt: daysAgo(11) },
    ],
  });

  await prisma.bookmarkNote.createMany({
    data: [
      { bookmarkId: bookmarkIds.bazar, body: "Go before 8am on Friday or the good fish is gone.", authorId: ids.nusrat, authorName: "Nusrat Jahan", createdAt: daysAgo(14) },
      { bookmarkId: bookmarkIds.bazar, body: "The stall at the far end weighs honestly — the first two do not.", authorId: ids.tanvir, authorName: "Tanvir Hasan", createdAt: daysAgo(6) },
      { bookmarkId: bookmarkIds.shwapno, body: "Card machine is often down. Carry cash.", authorId: ids.tanvir, authorName: "Tanvir Hasan", createdAt: daysAgo(4) },
      { bookmarkId: bookmarkIds.pharmacy, body: "Open till 11pm, and they deliver for orders over 500 taka.", authorId: ids.nusrat, authorName: "Nusrat Jahan", createdAt: daysAgo(3) },
      { bookmarkId: bookmarkIds.tailor, body: "Ask for Nazma herself, not the assistant. Two-day turnaround.", authorId: ids.nusrat, authorName: "Nusrat Jahan", createdAt: daysAgo(40) },
    ],
  });

  await prisma.confirmation.createMany({
    data: [
      { bookmarkId: bookmarkIds.bazar, residentId: ids.nusrat, verdict: "STILL_THERE", createdAt: daysAgo(2) },
      { bookmarkId: bookmarkIds.bazar, residentId: ids.tanvir, verdict: "STILL_THERE", createdAt: daysAgo(2) },
      { bookmarkId: bookmarkIds.shwapno, residentId: ids.tanvir, verdict: "STILL_THERE", createdAt: daysAgo(6) },
      { bookmarkId: bookmarkIds.pharmacy, residentId: ids.nusrat, verdict: "STILL_THERE", createdAt: daysAgo(3) },
      // A disagreement, so the freshness UI has a contested entry to show.
      { bookmarkId: bookmarkIds.tailor, residentId: ids.tanvir, verdict: "GONE", createdAt: daysAgo(1) },
    ],
  });

  // Deals across every status the derived-at-read-time logic can produce.
  const dealActive = await prisma.deal.create({
    data: {
      bookmarkId: bookmarkIds.shwapno, title: "10% off groceries over 2000 taka",
      description: "Show the app at the counter.", discountNote: "10%",
      validFrom: daysAgo(5), validUntil: inDays(12),
      postedById: ids.nusrat, postedByName: "Nusrat Jahan", lastConfirmedAt: daysAgo(2),
    },
  });
  await prisma.deal.create({
    data: {
      bookmarkId: bookmarkIds.bazar, title: "Friday morning fish discount",
      description: "Early birds only, before 8am.", discountNote: "Varies",
      validFrom: daysAgo(20), validUntil: inDays(1),
      postedById: ids.tanvir, postedByName: "Tanvir Hasan", lastConfirmedAt: daysAgo(4),
    },
  });
  await prisma.deal.create({
    data: {
      bookmarkId: bookmarkIds.pharmacy, title: "Free home delivery over 500 taka",
      description: "No end date given — needs re-confirming.", validFrom: daysAgo(70),
      validUntil: null, postedById: ids.nusrat, postedByName: "Nusrat Jahan",
      lastConfirmedAt: daysAgo(65),
    },
  });
  await prisma.deal.create({
    data: {
      bookmarkId: bookmarkIds.shwapno, title: "Eid week 15% off (finished)",
      validFrom: daysAgo(60), validUntil: daysAgo(30),
      postedById: ids.tanvir, postedByName: "Tanvir Hasan",
    },
  });

  await prisma.dealReport.createMany({
    data: [
      { dealId: dealActive.id, reportedById: ids.tanvir, verdict: "STILL_THERE", createdAt: daysAgo(2) },
      { dealId: dealActive.id, reportedById: ids.nusrat, verdict: "STILL_THERE", createdAt: daysAgo(1) },
    ],
  });
  console.log("  17 places, 5 notes, 5 confirmations, 4 deals (active / expiring / open-ended / expired)");

  /* ── M2.1 deeper wallet ───────────────────────────────────────────────── */

  console.log("Deepening the shared wallet (M2.1)…");

  // A custom (non-equal) split, because EQUAL alone never exercises the ratio
  // path the brief asks for.
  await prisma.expense.create({
    data: {
      houseId: houseIds.bashundhara, createdById: ids.nusrat, paidById: ids.nusrat,
      title: "Internet — August", description: "Tanvir works from home, so he takes the larger share.",
      amount: 1800, category: "UTILITIES", splitMethod: "CUSTOM", spentOn: daysAgo(10),
      shares: {
        create: [
          { userId: ids.nusrat, amount: 700, status: "PAID", settledAt: daysAgo(10) },
          { userId: ids.tanvir, amount: 1100 },
        ],
      },
    },
  });

  // A waived share — forgiven by the house admin, the third ShareStatus.
  await prisma.expense.create({
    data: {
      houseId: houseIds.bashundhara, createdById: ids.nusrat, paidById: ids.nusrat,
      title: "Eid cleaning service", amount: 1200, category: "OTHER",
      splitMethod: "EQUAL", spentOn: daysAgo(25),
      shares: {
        create: [
          { userId: ids.nusrat, amount: 600, status: "PAID", settledAt: daysAgo(25) },
          { userId: ids.tanvir, amount: 600, status: "WAIVED", settledAt: daysAgo(20) },
        ],
      },
    },
  });

  const gas = await prisma.expense.create({
    data: {
      houseId: houseIds.bashundhara, createdById: ids.tanvir, paidById: ids.tanvir,
      title: "Gas cylinder refill", amount: 1500, category: "UTILITIES",
      splitMethod: "EQUAL", spentOn: daysAgo(2),
      shares: {
        create: [
          { userId: ids.tanvir, amount: 750, status: "PAID", settledAt: daysAgo(2) },
          { userId: ids.nusrat, amount: 750 },
        ],
      },
    },
    include: { shares: true },
  });

  // A failed attempt, so the payment history is not uniformly successful —
  // and so the "retry after a failure" path has something behind it.
  await prisma.payment.create({
    data: {
      userId: ids.nusrat, houseId: houseIds.bashundhara,
      expenseShareId: gas.shares.find((s) => s.userId === ids.nusrat)!.id,
      provider: "STRIPE", status: "FAILED", amount: 750, currency: "BDT",
      providerPaymentId: `demo-stripe-failed-${Date.now()}`, createdAt: daysAgo(1),
    },
  });
  console.log("  3 more expenses (custom split, waived share, unpaid), 1 failed payment");

  /* ── M3.1 fuller ticket board ─────────────────────────────────────────── */

  console.log("Adding maintenance tickets (M3.1)…");
  const urgent = await prisma.maintenanceTicket.create({
    data: {
      houseId: houseIds.bashundhara, reportedById: ids.tanvir, assignedToId: ids.miftelul,
      title: "No water in the second-floor bathroom", description: "Nothing from the tap since this morning.",
      category: "Plumbing", status: "OPEN", priority: "URGENT", createdAt: daysAgo(1),
    },
  });
  await prisma.maintenanceTicketEvent.create({
    data: { ticketId: urgent.id, actorId: ids.tanvir, toStatus: "OPEN", note: "Reported" },
  });

  const closed = await prisma.maintenanceTicket.create({
    data: {
      houseId: houseIds.bashundhara, reportedById: ids.nusrat, title: "Front door lock sticking",
      description: "Key needed jiggling; locksmith came out.", category: "Hardware",
      status: "OPEN", priority: "LOW", createdAt: daysAgo(30),
    },
  });
  for (const [from, to, note] of [
    ["OPEN", "IN_PROGRESS", "Locksmith booked"],
    ["IN_PROGRESS", "RESOLVED", "Lock replaced"],
    ["RESOLVED", "CLOSED", "Confirmed working by the house"],
  ] as const) {
    await prisma.$transaction([
      prisma.maintenanceTicket.update({ where: { id: closed.id }, data: { status: to } }),
      prisma.maintenanceTicketEvent.create({
        data: { ticketId: closed.id, actorId: ids.miftelul, fromStatus: from, toStatus: to, note },
      }),
    ]);
  }
  console.log("  2 more tickets — all four statuses and all four priorities now present");

  /* ── M2.3 meals (Araf) and M3.4 chores (Mahia) — data only ────────────── */

  console.log("Adding meal attendance and chore rotation demo data…");
  const dateOnly = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

  for (const [offset, type, cost] of [
    [0, "LUNCH", 110], [0, "DINNER", 95],
    [1, "LUNCH", 120], [1, "DINNER", 100],
  ] as const) {
    const meal = await prisma.meal.create({
      data: {
        houseId: houseIds.bashundhara, mealDate: dateOnly(inDays(offset)),
        mealType: type, costPerHead: cost, locksAt: inDays(offset),
      },
    });
    // headcount is recalculated by the recalc_meal_headcount trigger.
    await prisma.mealAttendance.createMany({
      data: [
        { mealId: meal.id, userId: ids.nusrat, status: "ATTENDING" },
        { mealId: meal.id, userId: ids.tanvir, status: offset === 1 && type === "DINNER" ? "SKIPPING" : "ATTENDING" },
      ],
    });
  }

  const rotation = [ids.nusrat, ids.tanvir];
  for (const [name, description, frequency, idx] of [
    ["Kitchen deep clean", "Counters, stove, sink and floor.", "WEEKLY", 0],
    ["Bathroom clean", "Both bathrooms, including the drains.", "WEEKLY", 1],
    ["Grocery run", "Weekly staples from the kacha bazar.", "WEEKLY", 0],
  ] as const) {
    const chore = await prisma.chore.create({
      data: {
        houseId: houseIds.bashundhara, name, description, frequency,
        rotationOrder: rotation, lastAssignedIndex: idx,
      },
    });
    await prisma.choreAssignment.createMany({
      data: [
        { choreId: chore.id, userId: rotation[idx], dueDate: dateOnly(inDays(3)), status: "PENDING" },
        { choreId: chore.id, userId: rotation[1 - idx], dueDate: dateOnly(daysAgo(4)), status: "COMPLETED", completedAt: daysAgo(4) },
      ],
    });
  }
  console.log("  4 meals with attendance, 3 chores with rotation and assignments");

  console.log(`\nDone. Password for every account is ${PASSWORD}\n`);
  for (const p of PEOPLE) {
    console.log(`  ${`${p.key}@${DOMAIN}`.padEnd(30)} ${p.role.padEnd(9)} ${p.name}`);
  }
  console.log("\n  Demo path:");
  console.log(`    miftelul@${DOMAIN}  landlord — post / edit / delist listings, incoming join requests`);
  console.log(`    arif@${DOMAIN}      resident — search, filter, shortlist, request to join, matches, verified badge`);
  console.log(`    farhana@${DOMAIN}   resident — mutual roommate match + messages with arif`);
  console.log(`    moinul@${DOMAIN}    resident — mismatched profile, MUST_HAVE budget dealbreaker, blocked by sadia`);
  console.log(`    nusrat@${DOMAIN}    resident — /menu daily meal voting: Monday decided, Tuesday mid-vote, Wednesday fell back`);
  console.log(`    admin@${DOMAIN}     admin    — /admin, resolve the escalated dispute, /admin/profile-complaints`);
}

main()
  .catch((error) => {
    console.error("\nSeeding failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
