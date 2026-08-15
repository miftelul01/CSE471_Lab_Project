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
  console.log(
    `  2 expenses, 4 shares, 1 bKash payment — ledger row is now ${settled?.status}, ${trail} audit event(s)`
  );

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

  console.log(`\nDone. Password for every account is ${PASSWORD}\n`);
  for (const p of PEOPLE) {
    console.log(`  ${`${p.key}@${DOMAIN}`.padEnd(30)} ${p.role.padEnd(9)} ${p.name}`);
  }
  console.log("\n  Demo path:");
  console.log(`    miftelul@${DOMAIN}  landlord — post / edit / delist listings, incoming join requests`);
  console.log(`    arif@${DOMAIN}      resident — search, filter, shortlist, request to join, matches, verified badge`);
  console.log(`    farhana@${DOMAIN}   resident — mutual roommate match + messages with arif`);
  console.log(`    moinul@${DOMAIN}    resident — mismatched profile, MUST_HAVE budget dealbreaker, blocked by sadia`);
  console.log(`    admin@${DOMAIN}     admin    — /admin, resolve the escalated dispute, /admin/profile-complaints`);
}

main()
  .catch((error) => {
    console.error("\nSeeding failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
