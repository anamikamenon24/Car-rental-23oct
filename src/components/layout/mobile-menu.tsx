"use client";

import { useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";
import { MenuIcon, XIcon } from "@/components/ui/icons";
import { NavLink } from "./nav-link";
import { LogoutButton } from "./logout-button";

export type MobileMenuLink = { href: string; label: string };

export function MobileMenu({
  links,
  userName,
  showLogout,
}: {
  links: MobileMenuLink[];
  userName: string | null;
  showLogout: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();

  // Close when the route changes (the header stays mounted across navigations).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        className="inline-flex size-10 items-center justify-center rounded-lg text-ink-800 hover:bg-ink-100"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        data-testid="mobile-menu-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <XIcon className="size-6" /> : <MenuIcon className="size-6" />}
      </button>
      {open ? (
        <div
          id={panelId}
          className="absolute inset-x-0 top-16 z-40 border-b border-ink-200 bg-white px-4 pb-5 pt-3 shadow-[var(--shadow-pop)]"
        >
          {userName ? <p className="px-3 pb-2 text-sm text-ink-500">Signed in as {userName}</p> : null}
          <nav aria-label="Mobile" className="flex flex-col gap-1">
            {links.map((l) => (
              <NavLink key={l.href} href={l.href} className="py-3 text-base" onNavigate={() => setOpen(false)}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          {showLogout ? (
            <div className="mt-3 border-t border-ink-100 pt-3">
              <LogoutButton className="w-full justify-start" />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
