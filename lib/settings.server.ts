import "server-only";

import { prisma } from "@/lib/prisma";
import {
  SETTING_DEFAULTS,
  SETTING_KEYS,
  coerceSetting,
  type PlatformSettings,
} from "@/lib/settings";

/**
 * Server-side read of the platform settings.
 *
 * Kept apart from lib/settings.ts because that file is imported by the admin
 * settings form, a Client Component. The "server-only" import turns an
 * accidental client import into a clear build error.
 */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const rows = await prisma.platformSetting.findMany({ select: { key: true, value: true } });

    const merged = { ...SETTING_DEFAULTS };
    for (const row of rows) {
      if ((SETTING_KEYS as string[]).includes(row.key)) {
        const key = row.key as keyof PlatformSettings;
        // @ts-expect-error - coerceSetting returns exactly PlatformSettings[key],
        // but TypeScript cannot follow that through a loop over a union of keys.
        merged[key] = coerceSetting(key, row.value);
      }
    }
    return merged;
  } catch {
    // Called from the root layout: an unreachable settings table must cost a
    // custom platform name, never the whole app.
    return SETTING_DEFAULTS;
  }
}
