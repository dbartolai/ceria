import { NextResponse } from "next/server";
import { z } from "zod";
import { getPerson } from "@/lib/auth";
import { generateSessionDraft } from "@/lib/study-plans/ai";
import { preparationSchema } from "@/lib/study-plans/contracts";
import { sessionStudent } from "@/lib/study-plans/data";
import { FormError } from "@/lib/tutor/validation";

export const maxDuration = 120;
const requestSchema = z.object({ sessionId: z.uuid(), studentId: z.uuid(), kind: z.enum(["preparation", "plan"]),
  materialIds: z.array(z.uuid()).max(12), preparation: preparationSchema.optional() });

export async function POST(request: Request) {
  const context = await getPerson();
  if (!context) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (context.person.role !== "tutor") return NextResponse.json({ error: "Tutor access required." }, { status: 403 });
  const origin = request.headers.get("origin");
  const source = origin && URL.canParse(origin) ? new URL(origin) : null;
  // Next.js can use an internal hostname in request.url behind a proxy.
  if (!source || source.host !== request.headers.get("host") || !["https:", "http:"].includes(source.protocol)) {
    return NextResponse.json({ error: "Open ceria to prepare a session." }, { status: 403 });
  }
  try {
    const body = await request.text();
    if (body.length > 100_000) return NextResponse.json({ error: "The preparation is too long." }, { status: 413 });
    const parsed = requestSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return NextResponse.json({ error: "Check the selected student, materials, and notes." }, { status: 400 });
    const { sessionId, studentId, kind, materialIds, preparation } = parsed.data;
    if (new Set(materialIds).size !== materialIds.length) throw new FormError("Select each material only once.");
    const session = await sessionStudent(context.db, sessionId, studentId);
    const draft = await generateSessionDraft(context.db, session, studentId, kind, materialIds, preparation);
    return NextResponse.json(draft, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof FormError ? error.message : "The preparation could not be generated. Check your inputs and try again." }, { status: 400 });
  }
}
