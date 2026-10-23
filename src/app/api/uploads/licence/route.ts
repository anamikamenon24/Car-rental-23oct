import type { NextRequest } from "next/server";
import { errorResponse } from "@/server/action";
import { getCurrentUser } from "@/server/auth";
import { uploadLicence } from "@/server/uploads";

/** Multipart upload (field `file`) of a driving licence image/PDF for the signed-in user. */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: { code: "UNAUTHENTICATED", message: "Please sign in" } }, { status: 401 });
    const side = request.nextUrl.searchParams.get("side") === "back" ? "back" : "front";
    const form = await request.formData();
    return Response.json(await uploadLicence(user, form.get("file") as File, side), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
