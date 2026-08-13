/**
 * Platform settings (Common Workflow 2 — "overarching platform settings").
 *
 * Stored as jsonb rows in platform_settings so an admin can change behaviour
 * without a redeploy.
 *
 * This file must stay free of server-only imports: the admin settings form is
 * a Client Component and imports SETTING_KINDS from here. Reading the settings
 * touches next/headers, so that lives in ./settings.server.ts instead.
 */

export type PlatformSettings = {
  platform_name: string;
  signups_enabled: boolean;
  dispute_voting_hours: number;
  guest_max_nights: number;
  maintenance_mode: boolean;
};

export const SETTING_DEFAULTS: PlatformSettings = {
  platform_name: "Smart Mess",
  signups_enabled: true,
  dispute_voting_hours: 48,
  guest_max_nights: 7,
  maintenance_mode: false,
};

/** Which editor the admin console renders for each key. */
export const SETTING_KINDS: Record<keyof PlatformSettings, "text" | "boolean" | "number"> = {
  platform_name: "text",
  signups_enabled: "boolean",
  dispute_voting_hours: "number",
  guest_max_nights: "number",
  maintenance_mode: "boolean",
};

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as (keyof PlatformSettings)[];

/** Narrows an unknown jsonb value to the type the key is declared as. */
export function coerceSetting<K extends keyof PlatformSettings>(
  key: K,
  value: unknown
): PlatformSettings[K] {
  const kind = SETTING_KINDS[key];
  if (kind === "boolean" && typeof value === "boolean") return value as PlatformSettings[K];
  if (kind === "number" && typeof value === "number" && Number.isFinite(value)) {
    return value as PlatformSettings[K];
  }
  if (kind === "text" && typeof value === "string" && value.trim()) {
    return value as PlatformSettings[K];
  }
  return SETTING_DEFAULTS[key];
}

/** Validates a single setting value against its declared kind. */
export function validateSetting(key: string, value: unknown): string | null {
  if (!(SETTING_KEYS as string[]).includes(key)) return `Unknown setting "${key}".`;

  const kind = SETTING_KINDS[key as keyof PlatformSettings];
  if (kind === "boolean" && typeof value !== "boolean") return `${key} must be true or false.`;
  if (kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return `${key} must be a number of 0 or more.`;
    }
  }
  if (kind === "text" && (typeof value !== "string" || !value.trim())) {
    return `${key} must be a non-empty string.`;
  }
  return null;
}
