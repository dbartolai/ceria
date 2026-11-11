"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { idField, value } from "@/lib/tutor/validation";
import type { ActionResult } from "@/lib/tutor/fields";

export async function saveMaterialResponse(form: FormData): Promise<ActionResult> {
  const { db } = await requireRole("student");
  try {
    const materialId = idField(form, "material_id");
    const { error } = await db.rpc("save_material_response", { p_material_id: materialId, p_body: value(form, "body", 50000) });
    if (error) return { error: "Your work could not be saved. Check that this material is still shared and interactive, then try again." };
    revalidatePath(`/portal/materials/${materialId}`);
    return { message: "Your work is saved." };
  } catch {
    return { error: "Your work could not be saved. Keep a copy of your text and try again." };
  }
}
