import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePerson } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { db } = await requirePerson();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new NextResponse(null, { status: 404 });
  const { data: attachment } = await db.from("material_attachments").select("storage_path,filename").eq("id", id).maybeSingle();
  if (!attachment) return new NextResponse(null, { status: 404 });
  const { data } = await db.storage.from("materials").createSignedUrl(attachment.storage_path, 60, { download: attachment.filename });
  if (!data?.signedUrl) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
