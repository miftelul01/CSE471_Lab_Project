import { PreferencesForm } from "./PreferencesForm";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "My preferences — Smart Mess" };

/** M1.2 — lifestyle preference profile (Mahia Tanzin). */
export default async function PreferencesPage() {
  const user = await requireUser();
  const supabase = createClient();

  const { data: preference } = await supabase
    .from("preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="My lifestyle preferences"
        subtitle="These feed the matching engine. The closer they are to reality, the better your suggested houses will be."
      />
      <PreferencesForm preference={preference} />
    </div>
  );
}
