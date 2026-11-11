import { NextResponse } from "next/server";
import { z } from "zod";
import { inlineFile } from "@/lib/materials/file-response";
import { requirePerson } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { db } = await requirePerson();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new NextResponse(null, { status: 404 });
  const { data: attachment } = await db.from("material_attachments").select("storage_path,filename").eq("id", id).maybeSingle();
  if (!attachment) return new NextResponse(null, { status: 404 });
  return inlineFile(db, attachment.storage_path, attachment.filename);
}
