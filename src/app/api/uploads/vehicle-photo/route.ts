import { errorResponse } from "@/server/action";
import { getCurrentUser } from "@/server/auth";
import { uploadVehiclePhoto } from "@/server/uploads";

/** Multipart upload (field `file`) of a public vehicle photo. Admins only. */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: { code: "UNAUTHENTICATED", message: "Please sign in" } }, { status: 401 });
    const form = await request.formData();
    return Response.json(await uploadVehiclePhoto(user, form.get("file") as File), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
