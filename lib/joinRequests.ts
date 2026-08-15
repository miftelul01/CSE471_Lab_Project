/**
 * M1.2 — 14-Day Automated Request Expiry, shared by JoinRequest and
 * RoommateMatchRequest (both use the same PENDING -> ... -> EXPIRED
 * lifecycle via JoinRequestStatus).
 *
 * No cron/scheduler exists in this app, so this is lazy: called at the top
 * of the relevant GET/action handlers, it sweeps anything gone stale to
 * EXPIRED before the caller reads or acts on the data. State is always
 * correct by the time anyone looks, without a background job.
 */

export const REQUEST_EXPIRY_DAYS = 14;

type ExpirableDelegate = {
  updateMany: (args: {
    where: Record<string, unknown>;
    data: { status: "EXPIRED" };
  }) => Promise<{ count: number }>;
};

export async function expireStalePending(delegate: ExpirableDelegate, extraWhere?: Record<string, unknown>) {
  const cutoff = new Date(Date.now() - REQUEST_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  await delegate.updateMany({
    where: { status: "PENDING", createdAt: { lt: cutoff }, ...extraWhere },
    data: { status: "EXPIRED" },
  });
}
