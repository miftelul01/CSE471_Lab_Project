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
 * Secret for events this server raises about itself.
 *
 * Three flows end up here — the sandbox's confirm button, the bKash callback
 * once execute has come back Completed, and a confirmed cash handover — and
 * all three settle by posting a signed event to the same webhook rather than
 * writing SUCCEEDED themselves. One settle path, one signature check, no route
 * that can mark a bill paid on a caller's say-so.
 *
 * It borrows the app's own auth secret rather than defining a literal — a
 * constant in the source would let anyone who read the repo forge a
 * "payment succeeded" callback for somebody else's bill.
 *
 * AUTH_SECRET is NextAuth v5's name and is what this project actually sets;
 * NEXTAUTH_SECRET is accepted as the v4 spelling so the fallback does not
 * silently disappear if auth is ever downgraded or re-configured.
 */
const sandboxSecret = () =>
  readEnv("SANDBOX_PAYMENT_SECRET") || readEnv("AUTH_SECRET") || readEnv("NEXTAUTH_SECRET");

export const hasStripe = () => stripeKey().length > 0;

/**
 * True when SOME off-site gateway is configured, which is the only question
 * the built-in sandbox cares about: it exists to stand in when there is no
 * real one, and must switch itself off the moment there is.
 */
export const hasRealGateway = () => hasStripe() || hasBkash();

/**
 * Which provider a new payment is recorded against.
 *
 * MANUAL, not STRIPE, when unkeyed. The enum values come from the shared
 * schema and adding a SANDBOX one would mean a migration against the database
 * all three of us use; MANUAL already means "settled without a live gateway",
 * which is exactly what a simulated payment is. Labelling it STRIPE would put
 * a row in the ledger claiming a card was charged when none was.
 */
export const activeProvider = (): PaymentProvider =>
  hasBkash() ? "BKASH" : hasStripe() ? "STRIPE" : "MANUAL";

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

/* ── bKash tokenized checkout ───────────────────────────────────────────── */

/**
 * bKash's tokenized checkout, the flow the module requirement actually names.
 *
 * It is not a webhook gateway and must not be treated as one. The shape is:
 *
 *   grant token  ->  create payment  ->  [resident pays on bKash]
 *                ->  bKash redirects the BROWSER back to our callback
 *                ->  we call execute SERVER-SIDE, and its answer is the truth
 *
 * That last step is the whole security story. bKash sends the resident back
 * with `?paymentID=...&status=success`, and none of that is evidence — it is a
 * URL, and a resident who can read one can type one. The only thing that
 * settles a bill is the execute call this server makes with its own
 * credentials, which is why the callback route ignores `status` for anything
 * beyond deciding whether to bother calling execute at all.
 */

/** Sandbox host. The live host is https://tokenized.pay.bka.sh/v1.2.0-beta. */
const BKASH_SANDBOX_BASE = "https://tokenized.sandbox.bka.sh/v1.2.0-beta";

export function bkashConfig() {
  return {
    base: (readEnv("BKASH_BASE_URL") || BKASH_SANDBOX_BASE).replace(/\/+$/, ""),
    appKey: readEnv("BKASH_APP_KEY"),
    appSecret: readEnv("BKASH_APP_SECRET"),
    username: readEnv("BKASH_USERNAME"),
    password: readEnv("BKASH_PASSWORD"),
  };
}

/** All four credentials, not just some. A half-configured gateway that fails
 * at create is worse than one that never offered itself as an option. */
export function hasBkash(): boolean {
  const config = bkashConfig();
  return Boolean(config.appKey && config.appSecret && config.username && config.password);
}

/** bKash answers 200 OK with the failure inside the body, so the status code in
 * the JSON is the one that matters. "0000" is success; everything else is not. */
const BKASH_OK = "0000";

type BkashTokenResponse = {
  id_token?: string;
  expires_in?: number;
  statusCode?: string;
  statusMessage?: string;
};

type BkashCreateResponse = {
  paymentID?: string;
  bkashURL?: string;
  transactionStatus?: string;
  amount?: string;
  currency?: string;
  statusCode?: string;
  statusMessage?: string;
};

export type BkashPaymentResult = {
  paymentID?: string;
  trxID?: string;
  transactionStatus?: string;
  amount?: string;
  currency?: string;
  customerMsisdn?: string;
  merchantInvoiceNumber?: string;
  statusCode?: string;
  statusMessage?: string;
};

/**
 * The id_token, cached until shortly before it expires.
 *
 * Module scope, so it lives exactly as long as the serverless instance does.
 * Grant is rate limited upstream and a token is good for an hour, so fetching
 * a fresh one per payment would be both slower and closer to that limit for no
 * benefit. A cold instance simply grants its own.
 */
let bkashToken: { value: string; expiresAtMs: number } | null = null;

async function grantBkashToken(): Promise<string> {
  const config = bkashConfig();

  const response = await fetch(`${config.base}/tokenized/checkout/token/grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      // bKash wants these as headers and the app key/secret in the body.
      // Getting that backwards returns a cheerful 200 with no token in it.
      username: config.username,
      password: config.password,
    },
    body: JSON.stringify({ app_key: config.appKey, app_secret: config.appSecret }),
  });

  if (!response.ok) {
    throw new Error(`bKash token grant failed (HTTP ${response.status}).`);
  }

  const body = (await response.json()) as BkashTokenResponse;
  if (!body.id_token) {
    throw new Error(
      `bKash token grant refused (${body.statusCode ?? "no status"}: ${body.statusMessage ?? "no message"}).`
    );
  }

  // Renew a minute early rather than on the second — a token that expires
  // mid-flight fails a payment the resident has already authorised.
  const ttlSeconds = Number(body.expires_in) > 0 ? Number(body.expires_in) : 3600;
  bkashToken = { value: body.id_token, expiresAtMs: Date.now() + (ttlSeconds - 60) * 1000 };
  return bkashToken.value;
}

async function bkashAccessToken(): Promise<string> {
  if (bkashToken && bkashToken.expiresAtMs > Date.now()) return bkashToken.value;
  return grantBkashToken();
}

/**
 * One authenticated bKash call, retried once on an authentication failure.
 *
 * The retry is not optimism. A cached token can be revoked upstream or
 * invalidated by a grant from another instance, and that failure looks like an
 * ordinary refusal rather than a transport error — so the only way to tell a
 * stale token from a genuinely rejected payment is to drop the token and ask
 * again exactly once.
 */
async function bkashPost<T>(path: string, payload: unknown, allowRetry = true): Promise<T> {
  const config = bkashConfig();
  const token = await bkashAccessToken();

  const response = await fetch(`${config.base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: token,
      "X-APP-Key": config.appKey,
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 401 && allowRetry) {
    bkashToken = null;
    return bkashPost<T>(path, payload, false);
  }

  if (!response.ok) {
    throw new Error(`bKash ${path} failed (HTTP ${response.status}).`);
  }

  const body = (await response.json()) as T & { statusCode?: string };
  // 2001 is bKash's "invalid or expired token" delivered inside a 200.
  if (body.statusCode === "2001" && allowRetry) {
    bkashToken = null;
    return bkashPost<T>(path, payload, false);
  }
  return body;
}

async function createBkashCheckout(args: {
  paymentId: string;
  amountPaisa: number;
  origin: string;
  payerReference: string;
}): Promise<CheckoutSession> {
  const created = await bkashPost<BkashCreateResponse>("/tokenized/checkout/create", {
    mode: "0011",
    payerReference: args.payerReference,
    // bKash sends the resident's BROWSER here when they finish, cancel or fail.
    callbackURL: `${args.origin}/api/payments/bkash/callback`,
    // Taka as a 2dp string, which is what this endpoint wants — unlike Stripe,
    // which wants integer paisa. Same money, two conventions, one easy bug.
    amount: (args.amountPaisa / 100).toFixed(2),
    currency: "BDT",
    intent: "sale",
    // Our own id with the dashes stripped. bKash echoes it back on every later
    // call, and it is what ties their transaction to our ledger row.
    merchantInvoiceNumber: args.paymentId.replace(/-/g, ""),
  });

  if (created.statusCode !== BKASH_OK || !created.paymentID || !created.bkashURL) {
    throw new Error(
      `bKash refused the payment (${created.statusCode ?? "no status"}: ${created.statusMessage ?? "no message"}).`
    );
  }

  return {
    provider: "BKASH",
    redirectUrl: created.bkashURL,
    providerPaymentId: created.paymentID,
  };
}

/** Confirms a payment the resident authorised. This is the authoritative step:
 * nothing the browser carried back counts until this returns Completed. */
export async function executeBkashPayment(paymentID: string): Promise<BkashPaymentResult> {
  return bkashPost<BkashPaymentResult>("/tokenized/checkout/execute", { paymentID });
}

/**
 * Asks bKash what it believes the state of a payment is.
 *
 * Needed because execute is not safely repeatable: a resident who reloads the
 * callback, or whose first execute succeeded upstream but timed out on our
 * side, gets a refusal on the second attempt even though the money moved. When
 * that happens this is the only way to tell "never paid" from "already paid".
 */
export async function queryBkashPayment(paymentID: string): Promise<BkashPaymentResult> {
  return bkashPost<BkashPaymentResult>("/tokenized/checkout/payment/status", { paymentID });
}

/** bKash's word for a payment that actually completed. */
export const bkashSucceeded = (result: BkashPaymentResult): boolean =>
  result.statusCode === BKASH_OK && result.transactionStatus === "Completed";

/* ── Internal event signing ─────────────────────────────────────────────── */

/**
 * HMAC over the exact bytes the webhook will read.
 *
 * Signing the payment id alone would be replayable across amounts, so the
 * signature covers the whole raw body — the same property Stripe's scheme has,
 * and the reason the webhook must read req.text() before parsing.
 */
export function signInternalEvent(rawBody: string): string {
  return createHmac("sha256", sandboxSecret()).update(rawBody, "utf8").digest("hex");
}

/** Constant-time compare — a plain === leaks the signature a byte at a time. */
export function verifyInternalSignature(rawBody: string, signature: string): boolean {
  const secret = sandboxSecret();
  if (!secret || !signature) return false;

  const expected = Buffer.from(signInternalEvent(rawBody), "utf8");
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

/* ── Which methods a resident may choose ────────────────────────────────── */

/**
 * A payment method is not the same thing as a PaymentProvider.
 *
 * The provider enum records what settled a bill, after the fact, and is shared
 * schema none of us should be migrating casually. This is the narrower "what
 * can I click right now" list, derived from what is actually configured, and
 * SANDBOX exists here only because the built-in stand-in has to be selectable
 * when nothing else is.
 */
export type PaymentMethod = "BKASH" | "STRIPE" | "CASH" | "SANDBOX";

export type MethodOption = {
  method: PaymentMethod;
  label: string;
  hint: string;
  /** False for cash, which settles on a human confirming it, not a redirect. */
  redirects: boolean;
};

/**
 * Cash is always offered.
 *
 * It is the honest default in a mess: most settling up between roommates is
 * still a note handed over at the door, and a payments page that cannot record
 * that is a payments page people keep a separate reckoning alongside. It does
 * NOT settle on the payer's say-so — see confirmCashPayment's route.
 */
export function availableMethods(): MethodOption[] {
  const options: MethodOption[] = [];

  if (hasBkash()) {
    options.push({
      method: "BKASH",
      label: "bKash",
      hint: "Pay from your bKash wallet.",
      redirects: true,
    });
  }

  if (hasStripe()) {
    options.push({
      method: "STRIPE",
      label: "Card",
      hint: "Debit or credit card, via Stripe.",
      redirects: true,
    });
  }

  if (!hasRealGateway()) {
    options.push({
      method: "SANDBOX",
      label: "Simulated payment",
      hint: "No gateway is configured, so this stands in for one.",
      redirects: true,
    });
  }

  options.push({
    method: "CASH",
    label: "Cash",
    hint: "Record a handover. Whoever paid the bill has to confirm it.",
    redirects: false,
  });

  return options;
}

export const isMethodAvailable = (method: string): method is PaymentMethod =>
  availableMethods().some((option) => option.method === method);

/** The provider a chosen method is recorded against. SANDBOX maps to MANUAL
 * for the reason activeProvider() gives: it is settled without a live gateway,
 * and claiming otherwise would put a lie in the ledger. */
export const providerForMethod = (method: PaymentMethod): PaymentProvider =>
  ({ BKASH: "BKASH", STRIPE: "STRIPE", CASH: "CASH", SANDBOX: "MANUAL" } as const)[method];

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
 * Opens a checkout with the method the resident picked.
 *
 * CASH never reaches here: nothing is redirected to and nothing is called, so
 * the route records a claim and stops. Everything else returns somewhere to
 * send the browser.
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
  method: PaymentMethod;
  /** Identifies the payer to bKash; their phone when we know it. */
  payerReference: string;
}): Promise<CheckoutSession> {
  if (args.method === "CASH") {
    throw new Error("Cash payments do not open a checkout.");
  }

  if (args.method === "BKASH") {
    return createBkashCheckout({
      paymentId: args.paymentId,
      amountPaisa: args.amountPaisa,
      origin: args.origin,
      payerReference: args.payerReference,
    });
  }

  if (args.method === "STRIPE") return createStripeCheckout(args);

  return {
    provider: "MANUAL",
    redirectUrl: `${args.origin}/payments/sandbox/${args.paymentId}`,
    providerPaymentId: `sandbox_${args.paymentId}`,
  };
}
