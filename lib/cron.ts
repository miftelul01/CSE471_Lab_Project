/**
 * Shared scheduled-job authorization — used by every `app/api/cron/*` route.
 *
 * Extracted from M2.4's neighborhood job (the original, still the only other
 * caller) rather than copy-pasted for M3.4's chores job: this check is the
 * only thing standing between "scheduled housekeeping" and "anyone on the
 * internet can trigger it," so a second, independently-drifting copy is a
 * real risk, not a style nitpick.
 */
export function authorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Without a secret configured the endpoint would be an open button
    // anyone could press. In development that is convenient; in production
    // it is a stranger triggering the job.
    return process.env.NODE_ENV !== "production";
  }
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
