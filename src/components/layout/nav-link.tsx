"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export function NavLink({
  href,
  children,
  exact = false,
  className,
  onNavigate,
}: {
  href: string;
  children: ReactNode;
  exact?: boolean;
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-brand-50 text-brand-800" : "text-ink-700 hover:bg-ink-100 hover:text-ink-900",
        className,
      )}
    >
      {children}
    </Link>
  );
}
