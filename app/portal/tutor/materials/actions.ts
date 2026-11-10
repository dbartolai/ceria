"use server";

import { check, FormError, idField, optionalId, required, tutorAction, value } from "@/lib/tutor/validation";

const allowedTypes = new Set(["application/pdf", "text/plain", "image/png", "image/jpeg", "image/webp"]);

export async function saveMaterial(form: FormData) {
  return tutorAction(async (db) => {
    const id = optionalId(form, "id");
    const title = required(form, "title", "a title", 120);
    const body = value(form, "body", 12000);
    const attachment = form.get("attachment");
    const file = attachment instanceof File && attachment.size ? attachment : null;

    if (file && (file.size > 4 * 1024 * 1024 || !allowedTypes.has(file.type))) {
      throw new FormError("Choose a PDF, plain text, PNG, JPEG, or WebP file under 4 MB.");
    }

    const current = id
      ? await db.from("materials").select("engagement_id,session_id,student_id,storage_path,published_at").eq("id", id).single()
      : null;
    if (current?.error || current?.data?.published_at) throw new FormError("Published materials must be returned to draft first.");
    const engagement_id = current?.data?.engagement_id ?? idField(form, "engagement_id");
    const session_id = current?.data ? current.data.session_id : optionalId(form, "session_id");
    const student_id = current?.data ? current.data.student_id : optionalId(form, "student_id");
    if (!id && student_id && !session_id) {
      const { data, error } = await db.from("engagement_students").select("student_id")
        .eq("engagement_id", engagement_id).eq("student_id", student_id).maybeSingle();
      if (error || !data) throw new FormError("Choose a student enrolled in this engagement.");
    }
    const oldPath: string | null = current?.data?.storage_path ?? null;
    const removeFile = form.get("remove_attachment") === "on";
    if (!body && !file && (!oldPath || removeFile)) throw new FormError("Enter material text or attach a file.");
    const bucket = db.storage.from("materials");
    let newPath: string | null = null;

    if (file) {
      const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/^\.+/, "").slice(-100) || "attachment";
      newPath = `${engagement_id}/${crypto.randomUUID()}/${safeName}`;
      const { error } = await bucket.upload(newPath, file, { contentType: file.type, cacheControl: "0" });
      check(error, "The attachment could not be uploaded.");
    }

    const storage_path = newPath ?? (removeFile ? null : oldPath);
    const material = { engagement_id, session_id, student_id, title, body, storage_path };
    const update = id ? db.from("materials").update(material).eq("id", id).is("published_at", null) : null;
    const saved = update
      ? await (oldPath ? update.eq("storage_path", oldPath) : update.is("storage_path", null)).select("id").single()
      : await db.from("materials").insert(material).select("id").single();

    if (saved.error) {
      if (newPath) await bucket.remove([newPath]);
      throw new FormError("The draft could not be saved. Check that its student and session belong to the engagement.");
    }
    if (oldPath && oldPath !== storage_path) await bucket.remove([oldPath]);
    return { message: "Material draft saved.", href: id ? undefined : `/portal/tutor/materials/${saved.data!.id}` };
  });
}

export async function publishMaterial(form: FormData) {
  return tutorAction(async (db) => {
    const p_id = idField(form, "id");
    const { error } = await db.rpc("publish_material", { p_id });
    check(error, "The material could not be published.");
    return { message: "Material published." };
  });
}

export async function unpublishMaterial(form: FormData) {
  return tutorAction(async (db) => {
    const id = idField(form, "id");
    const { error } = await db.from("materials").update({ published_at: null }).eq("id", id).select("id").single();
    check(error, "The material could not be returned to draft.");
    return { message: "Material returned to draft." };
  });
}
