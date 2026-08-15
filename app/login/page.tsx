import { redirect } from "next/navigation";

import { LoginForm } from "./LoginForm";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Sign in — Smart Mess" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const user = await getSessionUser();
  if (user) redirect(searchParams.next || "/dashboard");

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold text-slate-900">Smart Mess</h1>
      <p className="mb-6 mt-1 text-sm text-slate-600">
        Sign in to manage your house, mess and shared expenses.
      </p>
      <LoginForm next={searchParams.next ?? "/dashboard"} />
    </div>
  );
}
