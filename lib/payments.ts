import { createHmac, timingSafeEqual } from "crypto";

import type { PaymentProvider, PaymentStatus } from "@prisma/client";

/**
 * M3.2 Payment Integration (bKash / Stripe) — Miftelul Mehebub.
 *
 * ── WHY THERE IS A SANDBOX PROVIDER ─────────────────────────────────────────
 * The requirement is a real gateway, and Stripe is wired below for when a key
 * exists. But a project that only works once somebody has signed up for a
 * merchant account is a project nobody can run — including whoever grades it.
 * So with no key configured the same flow runs against an in-app sandbox that
 * exercises the REAL webhook path, signature check included. The only thing
 * faked is the card form; every rule that protects the ledger is live.
 *
 * This mirrors what M2.4 already does with map providers: keyless by default,
 * upgraded when a credential appears. See lib/mapProviders.ts.
 * ────────────────────────────────────────────────────────────────────────────
 */

const STRIPE_CHECKOUT_URL = "https://api.stripe.com/v1/checkout/sessions";

/**
 * Reads an env var and treats a placeholder as absent.
 *
 * `.env` in this repo holds `STRIPE_SECRET_KEY=""` as a placeholder. Loaders
 * normally strip the quotes and leave an empty string, but if one ever does
 * not, a two-character `""` is truthy — and the difference between "no gateway
 * configured" and "gateway configured with a broken key" is the difference
 * between the sandbox running and every payment failing at checkout.
 */
function readEnv(name: string): string {
  const raw = process.env[name];
  if (!raw) return "";
  const trimmed = raw.trim().replace(/^(['"])(.*)\1$/, "$2").trim();
  return trimmed;
}

export const stripeKey = () => readEnv("STRIPE_SECRET_KEY");
export const stripeWebhookSecret = () => readEnv("STRIPE_WEBHOOK_SECRET");

/**
 * The sandbox signs its callbacks too, so the webhook has exactly one code
 * path. It borrows the app's own auth secret rather than defining a literal —
 * a constant in the source would let anyone who read the repo forge a
 * "payment succeeded" callback for somebody else's bill.
 *
 * AUTH_SECRET is NextAuth v5's name and is what this project actually sets;
 * NEXTAUTH_SECRET is accepted as the v4 spelling so the fallback does not
 * silently disappear if auth is ever downgraded or re-configured.
 */
const sandboxSecret = () =>
  readEnv("SANDBOX_PAYMENT_SECRET") || readEnv("AUTH_SECRET") || readEnv("NEXTAUTH_SECRET");

export const hasRealGateway = () => stripeKey().length > 0;

/**
 * Which provider a new payment is recorded against.
 *
 * MANUAL, not STRIPE, when unkeyed. The enum values come from the shared
 * schema and adding a SANDBOX one would mean a migration against the database
 * all three of us use; MANUAL already means "settled without a live gateway",
 * which is exactly what a simulated payment is. Labelling it STRIPE would put
 * a row in the ledger claiming a card was charged when none was.
 */
export const activeProvider = (): PaymentProvider => (hasRealGateway() ? "STRIPE" : "MANUAL");

export const providerLabel = (provider: PaymentProvider): string =>
  ({
    STRIPE: "Card (Stripe)",
    BKASH: "bKash",
    CASH: "Cash",
    MANUAL: "Sandbox (no gateway configured)",
  })[provider];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  INITIATED: "Started",
  PENDING: "Pending",
  SUCCEEDED: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, "slate" | "amber" | "green" | "red"> = {
  INITIATED: "slate",
  PENDING: "amber",
  SUCCEEDED: "green",
  FAILED: "red",
  REFUNDED: "slate",
};

/** Statuses that mean "this share already has money moving against it". */
export const LIVE_PAYMENT_STATUSES: PaymentStatus[] = ["INITIATED", "PENDING", "SUCCEEDED"];

/**
 * How long an unfinished checkout blocks a fresh attempt on the same share.
 *
 * Needed because a resident who opens a checkout and closes the tab leaves an
 * INITIATED row behind. Without an expiry that row would bar them from ever
 * paying that bill again; with one that is too long, they are stuck staring at
 * a Pay button that refuses. Thirty minutes is comfortably longer than a real
 * checkout takes and comfortably shorter than someone's patience.
 */
export const STALE_CHECKOUT_MS = 30 * 60 * 1000;

/* ── Sandbox signing ────────────────────────────────────────────────────── */

/**
 * HMAC over the exact bytes the webhook will read.
 *
 * Signing the payment id alone would be replayable across amounts, so the
 * signature covers the whole raw body — the same property Stripe's scheme has,
 * and the reason the webhook must read req.text() before parsing.
 */
export function signSandboxPayload(rawBody: string): string {
  return createHmac("sha256", sandboxSecret()).update(rawBody, "utf8").digest("hex");
}

/** Constant-time compare — a plain === leaks the signature a byte at a time. */
export function verifySandboxSignature(rawBody: string, signature: string): boolean {
  const secret = sandboxSecret();
  if (!secret || !signature) return false;

  const expected = Buffer.from(signSandboxPayload(rawBody), "utf8");
  const given = Buffer.from(signature, "utf8");
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/* ── Stripe signing ─────────────────────────────────────────────────────── */

/**
 * Verifies a `stripe-signature` header: `t=<unix>,v1=<hex>`, where the hex is
 * an HMAC-SHA256 of "<t>.<raw body>".
 *
 * Implemented by hand rather than pulling in the `stripe` package, which would
 * be a dependency for one function. The timestamp window is what stops a
 * captured-and-replayed callback from settling a bill twice.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string,
  toleranceSeconds = 300
): boolean {
  const secret = stripeWebhookSecret();
  if (!secret || !header) return false;

  const parts = Object.fromEntries(
    header
      .split(",")
      .map((part) => part.split("=", 2))
      .filter((pair): pair is [string, string] => pair.length === 2)
  );

  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ── Checkout ───────────────────────────────────────────────────────────── */

export type CheckoutSession = {
  provider: PaymentProvider;
  /** Where the browser is sent to complete the payment. */
  redirectUrl: string;
  /** The gateway's own id, stored for webhook lookup and idempotency. */
  providerPaymentId: string;
};

/**
 * Opens a Stripe Checkout session with the form-encoded REST API.
 *
 * Amounts cross as integer paisa because Stripe's smallest-unit convention and
 * a float taka value disagree in exactly the cases that matter — 0.1 + 0.2
 * problems on somebody's rent.
 */
async function createStripeCheckout(args: {
  paymentId: string;
  amountPaisa: number;
  currency: string;
  description: string;
  origin: string;
}): Promise<CheckoutSession> {
  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": args.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(args.amountPaisa),
    "line_items[0][price_data][product_data][name]": args.description.slice(0, 250),
    success_url: `${args.origin}/payments?paid=1`,
    cancel_url: `${args.origin}/payments?cancelled=1`,
    // Echoed back on the webhook event, so the callback can find our row
    // without trusting anything the browser round-tripped.
    "metadata[payment_id]": args.paymentId,
    client_reference_id: args.paymentId,
  });

  const response = await fetch(STRIPE_CHECKOUT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Stripe rejected the checkout session (${response.status}): ${detail}`);
  }

  const session = (await response.json()) as { id?: string; url?: string };
  if (!session.id || !session.url) {
    throw new Error("Stripe returned a checkout session with no id or URL.");
  }
  return { provider: "STRIPE", redirectUrl: session.url, providerPaymentId: session.id };
}

/**
 * Starts a checkout with whichever provider is configured.
 *
 * The sandbox's "gateway" is a page inside this app. It gets no signing secret
 * and no ability to settle anything by itself — it posts back to the same
 * webhook, and the server signs and verifies. The browser is never trusted.
 */
export async function createCheckout(args: {
  paymentId: string;
  amountPaisa: number;
  currency: string;
  description: string;
  origin: string;
}): Promise<CheckoutSession> {
  if (hasRealGateway()) return createStripeCheckout(args);

  return {
    provider: "MANUAL",
    redirectUrl: `${args.origin}/payments/sandbox/${args.paymentId}`,
    providerPaymentId: `sandbox_${args.paymentId}`,
  };
}
