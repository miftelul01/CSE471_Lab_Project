import { handlers } from "@/auth";

/** NextAuth's own endpoints: /api/auth/signin, /callback, /session, /signout. */
export const { GET, POST } = handlers;
