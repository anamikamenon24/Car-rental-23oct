import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/server/auth";
import { Skeleton } from "@/components/ui/spinner";
import { NavLink } from "./nav-link";
import { MobileMenu, type MobileMenuLink } from "./mobile-menu";
import { LogoutButton } from "./logout-button";
import { Logo } from "./logo";

const publicLinks: MobileMenuLink[] = [
  { href: "/search", label: "Find a car" },
  { href: "/branches", label: "Branches" },
];

export function SiteHeader() {
  return (
    <header className="no-print sticky top-0 z-40 border-b border-ink-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="shrink-0" aria-label="DriveEasy home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {/* usePathname suspends on routes with unknown dynamic params, so give it a static fallback. */}
          <Suspense
            fallback={publicLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100"
              >
                {l.label}
              </Link>
            ))}
          >
            {publicLinks.map((l) => (
              <NavLink key={l.href} href={l.href}>
                {l.label}
              </NavLink>
            ))}
          </Suspense>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Suspense fallback={<Skeleton className="h-9 w-40" />}>
            <HeaderAccount />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

async function HeaderAccount() {
  const user = await getCurrentUser();
  const accountLinks: MobileMenuLink[] = user
    ? [
        { href: "/account/rentals", label: "My rentals" },
        { href: "/account/profile", label: "Profile" },
        ...(user.role === "ADMIN" ? [{ href: "/admin", label: "Admin" }] : []),
      ]
    : [
        { href: "/login", label: "Sign in" },
        { href: "/register", label: "Create account" },
      ];

  return (
    <>
      <div className="hidden items-center gap-1 md:flex">
        {user ? (
          <>
            <nav aria-label="Account" className="flex items-center gap-1">
              {accountLinks.map((l) => (
                <NavLink key={l.href} href={l.href}>
                  {l.label}
                </NavLink>
              ))}
            </nav>
            <span className="mx-2 h-6 w-px bg-ink-200" aria-hidden="true" />
            <span className="max-w-40 truncate text-sm text-ink-600" title={user.email}>
              {user.name}
            </span>
            <LogoutButton />
          </>
        ) : (
          <>
            <NavLink href="/login">Sign in</NavLink>
            <Link
              href="/register"
              className="ml-1 inline-flex h-9 items-center rounded-lg bg-brand-700 px-3.5 text-sm font-semibold text-white hover:bg-brand-800"
            >
              Create account
            </Link>
          </>
        )}
      </div>
      <MobileMenu
        links={[...publicLinks, ...accountLinks]}
        userName={user?.name ?? null}
        showLogout={Boolean(user)}
      />
    </>
  );
}
