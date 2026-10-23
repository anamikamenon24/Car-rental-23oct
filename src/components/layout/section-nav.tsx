import Link from "next/link";
import { Suspense } from "react";
import { NavLink } from "./nav-link";

export type SectionLink = { href: string; label: string; exact?: boolean };

/** Horizontal sub-navigation (account, admin). Active state needs the pathname, so it streams. */
export function SectionNav({ label, links }: { label: string; links: SectionLink[] }) {
  return (
    <nav aria-label={label} className="no-print -mx-4 overflow-x-auto border-b border-ink-200 px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 pb-2">
        <Suspense
          fallback={links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100">
              {l.label}
            </Link>
          ))}
        >
          {links.map((l) => (
            <NavLink key={l.href} href={l.href} exact={l.exact}>
              {l.label}
            </NavLink>
          ))}
        </Suspense>
      </div>
    </nav>
  );
}
