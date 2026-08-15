/**
 * M1.2 — Post-Move-In Feedback Window (Mess Court integration), Mahia Tanzin.
 *
 * Addresses profile dishonesty (e.g. exaggerating cleanliness habits): once a
 * new resident moves in, existing housemates get a fixed window to flag a
 * mismatch between what was promised and reality, before it's "just how
 * things are now."
 */

export const VERIFICATION_WINDOW_DAYS = 14;

export function verificationWindowFor(joinedAt: Date): { opensAt: Date; closesAt: Date } {
  const closesAt = new Date(joinedAt);
  closesAt.setDate(closesAt.getDate() + VERIFICATION_WINDOW_DAYS);
  return { opensAt: joinedAt, closesAt };
}

export function isVerificationWindowOpen(joinedAt: Date, now = new Date()): boolean {
  const { closesAt } = verificationWindowFor(joinedAt);
  return now <= closesAt;
}
