import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Container } from "@/components/ui/page";
import { SearchIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <Container className="py-16">
      <EmptyState
        data-testid="not-found"
        icon={<SearchIcon className="size-6" />}
        title="We couldn't find that page"
        description="The link may be broken, or the page may have been removed. Try searching for a car instead."
        action={
          <>
            <ButtonLink href="/">Go home</ButtonLink>
            <ButtonLink href="/search" variant="outline">
              Find a car
            </ButtonLink>
          </>
        }
      />
    </Container>
  );
}
