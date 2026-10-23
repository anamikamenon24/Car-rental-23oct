"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/auth";
import { runAction } from "@/server/action";
import {
  createCategory,
  createMaintenanceBlock,
  createVehicle,
  deleteMaintenanceBlock,
  setVehicleStatus,
  updateCategory,
  updateVehicle,
} from "@/server/admin/fleet";
import type { CategoryInput, VehicleInput } from "@/server/validation";
import { errorState, formValues, type FormState } from "@/lib/ui/form-state";
import { adminMutation, aedToFils, localToIso, opt, str } from "../_lib/form";

type VehicleStatus = "AVAILABLE" | "RESERVED" | "ON_RENT" | "MAINTENANCE" | "RETIRED";

function vehicleInput(fd: FormData): VehicleInput {
  return {
    categoryId: str(fd, "categoryId"),
    branchId: str(fd, "branchId"),
    make: str(fd, "make"),
    model: str(fd, "model"),
    year: str(fd, "year"),
    plate: str(fd, "plate"),
    vin: str(fd, "vin"),
    color: str(fd, "color"),
    transmission: str(fd, "transmission") as "AUTOMATIC" | "MANUAL",
    fuelType: str(fd, "fuelType") as "PETROL" | "DIESEL" | "HYBRID" | "ELECTRIC",
    seats: str(fd, "seats"),
    doors: str(fd, "doors"),
    luggage: str(fd, "luggage"),
    mileageKm: str(fd, "mileageKm"),
    status: (str(fd, "status") || "AVAILABLE") as VehicleStatus,
    imageUrl: opt(fd, "imageUrl"),
    description: opt(fd, "description"),
    featureCodes: fd.getAll("featureCodes").filter((v): v is string => typeof v === "string"),
  } as VehicleInput;
}

export async function createVehicleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireAdmin();
  const values = formValues(fd);
  const result = await runAction(() => createVehicle(actor, vehicleInput(fd)));
  if (!result.ok) return errorState(result.error, values);
  redirect(`/admin/fleet/${result.data.id}?created=1`);
}

export async function updateVehicleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return adminMutation(fd, (actor) => updateVehicle(actor, str(fd, "id"), vehicleInput(fd)), {
    success: "Vehicle saved.",
    keepValues: true,
  });
}

export async function setVehicleStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return adminMutation(fd, (actor) => setVehicleStatus(actor, str(fd, "id"), str(fd, "status") as VehicleStatus), {
    success: (v) => `Status changed to ${v.status.toLowerCase().replace("_", " ")}.`,
  });
}

export async function createMaintenanceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const tz = str(fd, "timeZone") || "Asia/Dubai";
  return adminMutation(
    fd,
    (actor) =>
      createMaintenanceBlock(actor, {
        vehicleId: str(fd, "vehicleId"),
        startsAt: localToIso(str(fd, "startsAt"), tz),
        endsAt: localToIso(str(fd, "endsAt"), tz),
        reason: str(fd, "reason"),
      }),
    { success: "Maintenance block added. The car can't be booked in that period." },
  );
}

export async function deleteMaintenanceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return adminMutation(fd, (actor) => deleteMaintenanceBlock(actor, str(fd, "id")), {
    success: "Maintenance block removed.",
  });
}

function categoryInput(fd: FormData): CategoryInput {
  return {
    code: str(fd, "code"),
    slug: str(fd, "slug"),
    name: str(fd, "name"),
    description: opt(fd, "description"),
    depositFils: aedToFils(str(fd, "depositFils")),
    sortOrder: str(fd, "sortOrder") || "0",
  } as CategoryInput;
}

export async function createCategoryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return adminMutation(fd, (actor) => createCategory(actor, categoryInput(fd)), { success: (c) => `Category ${c.name} created.` });
}

export async function updateCategoryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return adminMutation(fd, (actor) => updateCategory(actor, str(fd, "id"), categoryInput(fd)), {
    success: "Category saved.",
    keepValues: true,
  });
}
