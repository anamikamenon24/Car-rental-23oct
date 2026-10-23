"use server";

import { createBranch, updateBranch } from "@/server/admin/branches";
import type { BranchInput } from "@/server/validation";
import type { FormState } from "@/lib/ui/form-state";
import { adminMutation, bool, opt, str } from "../_lib/form";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function branchInput(fd: FormData): BranchInput {
  const opens = str(fd, "opensAt");
  const closes = str(fd, "closesAt");
  const openingHours = bool(fd, "open24h")
    ? ({ "24h": true } as const)
    : (Object.fromEntries(DAYS.map((d) => [d, [opens, closes]])) as Record<(typeof DAYS)[number], [string, string]>);
  return {
    code: str(fd, "code"),
    slug: str(fd, "slug"),
    name: str(fd, "name"),
    city: str(fd, "city"),
    address: str(fd, "address"),
    phone: opt(fd, "phone"),
    email: opt(fd, "email"),
    latitude: opt(fd, "latitude"),
    longitude: opt(fd, "longitude"),
    timeZone: str(fd, "timeZone") || "Asia/Dubai",
    openingHours,
    isAirport: bool(fd, "isAirport"),
    isActive: bool(fd, "isActive"),
    imageUrl: opt(fd, "imageUrl"),
  };
}

export async function createBranchAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return adminMutation(fd, (actor) => createBranch(actor, branchInput(fd)), {
    success: (b) => `Branch ${b.name} created.`,
  });
}

export async function updateBranchAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return adminMutation(fd, (actor) => updateBranch(actor, str(fd, "id"), branchInput(fd)), {
    success: "Branch saved.",
    keepValues: true,
  });
}
