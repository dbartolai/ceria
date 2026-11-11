import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import type { ActionResult } from "./fields";

type TutorDb = Awaited<ReturnType<typeof requireRole>>["db"];

export class FormError extends Error {}

export async function tutorAction(work: (db: TutorDb) => Promise<{ message: string; href?: string }>): Promise<ActionResult> {
  const { db } = await requireRole("tutor");
  try {
    const result = await work(db);
    revalidatePath("/portal", "layout");
    return result;
  } catch (error) {
    if (error instanceof FormError) return { error: error.message };
    console.error("Tutor action failed", error instanceof Error ? error.name : "Database request");
    return { error: "The request could not be completed. Try again in a moment." };
  }
}

export function value(form: FormData, name: string, max = 3000) {
  const field = form.get(name);
  if (typeof field !== "string") return "";
  if (field.length > max) throw new FormError("One of the fields is too long.");
  return field.trim();
}

export function required(form: FormData, name: string, label: string, max = 3000) {
  const field = value(form, name, max);
  if (!field) throw new FormError(`Enter ${label}.`);
  return field;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(input: string) {
  return uuidPattern.test(input);
}

export function optionalId(form: FormData, name: string) {
  const id = value(form, name, 40);
  if (id && !isUuid(id)) throw new FormError("Choose a valid record.");
  return id || null;
}

export function idField(form: FormData, name: string) {
  const id = optionalId(form, name);
  if (!id) throw new FormError("Choose a record.");
  return id;
}

export function idList(form: FormData, name: string) {
  const ids = form.getAll(name);
  if (ids.some((id) => typeof id !== "string" || !isUuid(id))) throw new FormError("Choose valid participants.");
  return [...new Set(ids as string[])];
}

export function choice<T extends string>(form: FormData, name: string, allowed: readonly T[]) {
  const input = value(form, name, 50);
  const match = allowed.find((option) => option === input);
  if (!match) throw new FormError("Choose a valid option.");
  return match;
}

export function check(error: unknown, message: string) {
  if (error) throw new FormError(message);
}

export async function requireClient(db: TutorDb, id: string, role: "student" | "guardian") {
  const { data, error } = await db.from("people").select("id").eq("id", id).eq("role", role).is("deleted_at", null).maybeSingle();
  if (error || !data) throw new FormError(`Choose an existing ${role}.`);
}
