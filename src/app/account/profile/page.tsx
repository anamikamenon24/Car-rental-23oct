import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/server/auth";
import { getDriverProfile } from "@/server/profile";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader, Badge } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/spinner";
import { ProfileForm } from "@/components/rentals/profile-form";
import { saveProfileAction } from "./actions";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Profile & licence" description="Saved details are used to speed up your next booking." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <ProfileContent />
      </Suspense>
    </>
  );
}

async function ProfileContent() {
  const user = await requireUser("/account/profile");
  const profile = await getDriverProfile(user);
  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card className="self-start">
        <CardHeader title="Account" />
        <CardBody className="space-y-2 text-sm">
          <p>
            <span className="block text-ink-500">Name</span>
            <span className="font-medium text-ink-900" data-testid="profile-name">
              {user.name}
            </span>
          </p>
          <p>
            <span className="block text-ink-500">Email</span>
            <span className="font-medium text-ink-900" data-testid="profile-email">
              {user.email}
            </span>
          </p>
          {user.role === "ADMIN" ? <Badge tone="brand">Administrator</Badge> : null}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Driver details" description="Your licence photos are private: only you and DriveEasy staff can see them." />
        <CardBody>
          <ProfileForm
            action={saveProfileAction}
            defaults={
              profile
                ? {
                    ...profile,
                  }
                : { fullName: user.name }
            }
          />
        </CardBody>
      </Card>
    </div>
  );
}
