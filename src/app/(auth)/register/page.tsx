import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/server/auth";
import { RegisterForm } from "@/components/auth/auth-forms";
import { safeNext } from "@/lib/ui/safe-next";
import { Skeleton } from "@/components/ui/spinner";
import { one } from "@/lib/ui/search-params";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage({ searchParams }: PageProps<"/register">) {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-ink-600">Book in minutes and keep your vouchers in one place.</p>
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-80 w-full" />}>
          <RegisterContent searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function RegisterContent({ searchParams }: { searchParams: PageProps<"/register">["searchParams"] }) {
  const next = one((await searchParams).next);
  const user = await getCurrentUser();
  if (user) redirect(safeNext(next));
  return <RegisterForm next={next} />;
}
