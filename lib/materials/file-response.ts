import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function inlineFile(db: SupabaseClient, path: string, filename: string) {
  const { data: file, error } = await db.storage.from("materials").download(path);
  if (error || !file) return new Response(null, { status: 404 });
  const type = file.type.split(";")[0];
  const safe = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"].includes(type);
  return new Response(file, { headers: {
    "Content-Type": safe ? type : "application/octet-stream",
    "Content-Disposition": `${safe ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16)}`)}`,
    "Cache-Control": "private, no-store", "X-Frame-Options": "SAMEORIGIN", "X-Content-Type-Options": "nosniff",
  } });
}
