import { Container } from "@/components/ui/page";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <Container className="flex flex-1 items-start justify-center py-10 sm:py-16">
      <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
        {children}
      </div>
    </Container>
  );
}
