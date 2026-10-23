import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/server/auth";
import { LoginForm } from "@/components/auth/auth-forms";
import { safeNext } from "@/lib/ui/safe-next";
import { Skeleton } from "@/components/ui/spinner";
import { one } from "@/lib/ui/search-params";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-ink-600">Manage your rentals and book faster.</p>
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <LoginContent searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function LoginContent({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const next = one((await searchParams).next);
  const user = await getCurrentUser();
  if (user) redirect(safeNext(next));
  return <LoginForm next={next} />;
}
