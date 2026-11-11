"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { idField } from "@/lib/tutor/validation";

export async function completeStudyTask(form: FormData) {
  const { db } = await requireRole("student");
  try {
    const { error } = await db.rpc("complete_study_plan_item", { p_id: idField(form, "id"), p_completed: form.get("completed") === "true" });
    if (error) return { error: "The study task could not be updated. Refresh the page and try again." };
    revalidatePath("/portal", "layout");
    return { message: "Study task updated." };
  } catch { return { error: "Choose an available study task." }; }
}
