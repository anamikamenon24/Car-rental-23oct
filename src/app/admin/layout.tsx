import { Container } from "@/components/ui/page";
import { SectionNav } from "@/components/layout/section-nav";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Container className="pt-6">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-700">
        <span className="rounded bg-accent-100 px-1.5 py-0.5">Admin</span> DriveEasy operations
      </div>
      <SectionNav
        label="Admin"
        links={[
          { href: "/admin", label: "Dashboard", exact: true },
          { href: "/admin/reservations", label: "Reservations" },
          { href: "/admin/fleet", label: "Fleet" },
          { href: "/admin/branches", label: "Branches" },
          { href: "/admin/pricing", label: "Pricing & extras" },
          { href: "/admin/damage", label: "Damage reports" },
        ]}
      />
      {children}
    </Container>
  );
}
