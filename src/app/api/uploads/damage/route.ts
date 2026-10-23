import { errorResponse } from "@/server/action";
import { getCurrentUser } from "@/server/auth";
import { uploadDamagePhoto } from "@/server/uploads";

/** Multipart upload (field `file`) of a damage photo. Admins only; stored privately. */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: { code: "UNAUTHENTICATED", message: "Please sign in" } }, { status: 401 });
    const form = await request.formData();
    return Response.json(await uploadDamagePhoto(user, form.get("file") as File), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
