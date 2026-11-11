import type { Metadata } from "next";
import { MaterialList, type MaterialListItem } from "@/components/material-list";
import { requireRole } from "@/lib/auth";
import { rows } from "@/lib/portal-data";

export const metadata: Metadata = { title: "Learning materials" };

export default async function MaterialsPage() {
  const { db } = await requireRole("student");
  const materials = rows(await db.from("materials").select("id,title,interactive,published_at,engagements(title),material_attachments(id)")
    .order("published_at", { ascending: false }).returns<MaterialListItem[]>(), "materials");
  return <>
    <header className="page-intro"><h1>Learning materials</h1><p>Open your tutor’s documents and handouts in a new tab.</p></header>
    {materials.length ? <MaterialList materials={materials} /> : <p className="empty">No learning materials have been shared with you yet.</p>}
  </>;
}
