import { SettingsForm } from "./SettingsForm";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Platform settings — Smart Mess" };

/** Common Workflow 2 — "manage overarching platform settings". */
export default async function AdminSettingsPage() {
  const settings = await prisma.platformSetting.findMany({ orderBy: { key: "asc" } });

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Platform settings"
        subtitle="Applies to every house. Changes take effect immediately — no redeploy."
      />
      <SettingsForm settings={settings} />
    </div>
  );
}
