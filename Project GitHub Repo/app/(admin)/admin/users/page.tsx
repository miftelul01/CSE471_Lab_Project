import { UserRoleTable } from "./UserRoleTable";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

export const metadata = { title: "Users & roles — Smart Mess" };

export type AdminUserRow = Pick<User, "id" | "email" | "name" | "phone" | "role" | "createdAt">;

/** Common Workflow 2 — "admins oversee system-wide parameters". */
export default async function AdminUsersPage() {
  // The ADMIN role is already enforced by app/admin/layout.tsx; the id here is
  // only so the table can stop an admin demoting themselves.
  const user = await requireUser();

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Users & roles"
        subtitle="Role decides what someone can do platform-wide. House-level admin rights are separate, and are granted per house on the houses page."
      />
      <UserRoleTable users={users} currentUserId={user.id} />
    </div>
  );
}
