import { Container } from "@/components/ui/page";
import { SectionNav } from "@/components/layout/section-nav";

export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return (
    <Container className="pt-6">
      <SectionNav
        label="Account"
        links={[
          { href: "/account/rentals", label: "My rentals" },
          { href: "/account/profile", label: "Profile & licence" },
        ]}
      />
      {children}
    </Container>
  );
}
