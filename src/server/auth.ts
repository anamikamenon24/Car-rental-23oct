import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DomainError } from "./errors";

export type Role = "CUSTOMER" | "ADMIN";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  image: string | null;
}

/** The authenticated caller passed into services. */
export type Actor = Pick<SessionUser, "id" | "role"> & Partial<SessionUser>;

/** Current signed-in user, or null. Never redirects. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user as typeof session.user & { role?: string };
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role === "ADMIN" ? "ADMIN" : "CUSTOMER",
    image: u.image ?? null,
  };
}

/** Signed-in user or redirect to /login?next=... */
export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  return user;
}

/** Admin or redirect (anonymous) / 404 (customers, so the admin area is not advertised). */
export async function requireAdmin(nextPath = "/admin"): Promise<SessionUser> {
  const user = await requireUser(nextPath);
  if (user.role !== "ADMIN") notFound();
  return user;
}

/** Service-level guard: throws instead of redirecting. */
export function assertAdmin(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor) throw new DomainError("UNAUTHENTICATED", "Please sign in");
  if (actor.role !== "ADMIN") throw new DomainError("FORBIDDEN", "Administrators only");
}

export function assertActor(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor?.id) throw new DomainError("UNAUTHENTICATED", "Please sign in");
}
