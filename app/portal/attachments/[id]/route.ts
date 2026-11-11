import { NextResponse } from "next/server";
import { z } from "zod";
import { inlineFile } from "@/lib/materials/file-response";
import { requirePerson } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { db } = await requirePerson();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new NextResponse(null, { status: 404 });
  const { data: material } = await db.from("materials").select("storage_path").eq("id", id).maybeSingle();
  if (!material?.storage_path) return new NextResponse(null, { status: 404 });
  return inlineFile(db, material.storage_path, material.storage_path.split("/").at(-1) || "Material");
}
