"use server";

import { check, FormError, idField, optionalId, required, tutorAction, value } from "@/lib/tutor/validation";

const allowedTypes = new Set(["application/pdf", "text/plain", "image/png", "image/jpeg", "image/webp"]);

export async function saveMaterial(form: FormData) {
  return tutorAction(async (db) => {
    const id = optionalId(form, "id");
    const title = required(form, "title", "a title", 120);
    const body = value(form, "body", 12000);
    const current = id
      ? await db.from("materials").select("engagement_id,session_id,student_id,published_at").eq("id", id).single()
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

    const material = { engagement_id, session_id, student_id, title, body };
    const saved = id
      ? await db.from("materials").update(material).eq("id", id).is("published_at", null).select("id").single()
      : await db.from("materials").insert(material).select("id").single();
    check(saved.error, "The draft could not be saved. Check that its student and session belong to the engagement.");
    return { message: "Material draft saved.", href: id ? undefined : `/portal/tutor/materials/${saved.data!.id}` };
  });
}

export async function uploadMaterialFile(form: FormData) {
  return tutorAction(async (db) => {
    const materialId = idField(form, "material_id");
    const uploadId = idField(form, "upload_id");
    const attachment = form.get("attachment");
    if (!(attachment instanceof File) || !attachment.size || attachment.size > 4 * 1024 * 1024 || !allowedTypes.has(attachment.type)) {
      throw new FormError("Choose a PDF, plain text, PNG, JPEG, or WebP file up to 4 MB.");
    }
    const { data: material, error } = await db.from("materials").select("engagement_id,published_at").eq("id", materialId).single();
    check(error, "The material could not be loaded.");
    const safeName = attachment.name.replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/^\.+/, "").slice(-100) || "attachment";
    const path = `${material!.engagement_id}/${uploadId}/${safeName}`;
    const existing = await db.from("material_attachments").select("id").eq("material_id", materialId).eq("storage_path", path).maybeSingle();
    check(existing.error, "The file could not be checked.");
    if (existing.data) return { message: "File added." };
    if (material!.published_at) throw new FormError("Return the material to draft before adding files.");

    const bucket = db.storage.from("materials");
    const uploaded = await bucket.upload(path, attachment, { contentType: attachment.type, cacheControl: "0" });
    if (uploaded.error && uploaded.error.statusCode !== "409") {
      throw new FormError("The file could not be uploaded. Please try again.");
    }
    const registered = await db.rpc("add_material_attachment", {
      p_material_id: materialId,
      p_storage_path: path,
      p_filename: attachment.name.slice(0, 255),
      p_size_bytes: attachment.size,
    });
    if (registered.error) {
      const recovered = await db.from("material_attachments").select("id").eq("material_id", materialId).eq("storage_path", path).maybeSingle();
      if (recovered.data) return { message: "File added." };
      if (!recovered.error && !uploaded.error) await bucket.remove([path]);
      throw new FormError("The file could not be added. Confirm that the material is still a draft and try again.");
    }
    return { message: "File added." };
  });
}

export async function removeMaterialFile(form: FormData) {
  return tutorAction(async (db) => {
    const id = idField(form, "id");
    const { data: path, error } = await db.rpc("remove_material_attachment", { p_id: id });
    check(error, "The file could not be removed. Return the material to draft before changing its files.");
    if (path) await db.storage.from("materials").remove([path]);
    return { message: "File removed." };
  });
}

export async function publishMaterial(form: FormData) {
  return tutorAction(async (db) => {
    const p_id = idField(form, "id");
    const { error } = await db.rpc("publish_material", { p_id });
    check(error, "The material could not be published. Add material text or a file before publishing.");
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
