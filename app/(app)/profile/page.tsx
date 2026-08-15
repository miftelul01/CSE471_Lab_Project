import { ProfileForm } from "./ProfileForm";
import { VerificationCard } from "./VerificationCard";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "My profile — Smart Mess" };

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader
        title="My profile"
        subtitle="Contact details and emergency information. Your housemates can see your name; only you can edit this."
      />
      <ProfileForm profile={user.profile} />
      <VerificationCard />
    </div>
  );
}
