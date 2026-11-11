import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FormError } from "@/lib/tutor/validation";
import { planDraftSchema, planProposalSchema, preparationProposalSchema, preparationSchema, type Preparation } from "./contracts";
import { preparationMaterials } from "./data";
import { sessionDraftInstructions } from "./prompts";

export async function generateSessionDraft(db: SupabaseClient, session: { id: string; engagement_id: string; duration_minutes: number },
  studentId: string, kind: "preparation" | "plan", materialIds: string[], preparation?: Preparation) {
  if (!process.env.OPENAI_API_KEY) throw new FormError("AI preparation needs an OpenAI API key configured on the server. You can still write and save a plan manually.");
  const available = await preparationMaterials(db, session.engagement_id, session.id, studentId);
  const selected = available.filter(material => materialIds.includes(material.id));
  if (selected.length !== materialIds.length) throw new FormError("Choose materials available for this student and session.");
  const files = selected.flatMap(material => material.material_attachments);
  if (files.length > 12 || files.reduce((size, file) => size + (file.size_bytes ?? 4_194_304), 0) > 25_000_000) {
    throw new FormError("Choose fewer materials. Each generation supports up to 12 files and 25 MB total.");
  }
  const { data: notes, error: noteError } = await db.from("session_notes").select("topics,strengths,weaknesses,next_steps")
    .eq("session_id", session.id).or(`student_id.is.null,student_id.eq.${studentId}`);
  if (noteError) throw new FormError("The lesson notes could not be loaded.");
  if (!selected.length && !notes.length && !preparation?.summary && !preparation?.topics.length) {
    throw new FormError("Select materials or add preparation notes first.");
  }
  const content: ResponseInputContent[] = [{ type: "input_text", text: JSON.stringify({
    task: kind, sessionMinutes: session.duration_minutes, lessonNotes: notes,
    materials: selected.map(material => ({ title: material.title, text: material.body })),
    preparation,
  }) }];
  // Download through the tutor's authenticated Storage client; no public or
  // long-lived file links are sent to OpenAI or stored in generation output.
  const fileContent = await Promise.all(files.map(async (file): Promise<ResponseInputContent[]> => {
    const parts: ResponseInputContent[] = [];
    const { data: blob, error } = await db.storage.from("materials").download(file.storage_path);
    if (error || !blob) throw new FormError(`The file ${file.filename} could not be read. Try again after checking the attachment.`);
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (bytes.length > 4_194_304) throw new FormError("A selected file exceeds the 4 MB limit.");
    parts.push({ type: "input_text", text: `Source file: ${file.filename}` });
    if (blob.type.startsWith("image/")) {
      parts.push({ type: "input_image", image_url: `data:${blob.type};base64,${bytes.toString("base64")}`, detail: "high" });
    } else if (blob.type === "application/pdf" || file.filename.toLowerCase().endsWith(".pdf")) {
      parts.push({ type: "input_file", filename: file.filename, file_data: `data:application/pdf;base64,${bytes.toString("base64")}` });
    } else {
      parts.push({ type: "input_text", text: bytes.toString("utf8").slice(0, 30000) });
    }
    return parts;
  }));
  content.push(...fileContent.flat());
  const { data: claimed, error: claimError } = await db.rpc("claim_session_ai_request", { p_session_id: session.id, p_kind: kind });
  if (claimError || !claimed) throw new FormError("Please wait two minutes before generating this draft again.");
  const client = new OpenAI({ timeout: 110_000, maxRetries: 0 });
  try {
    const response = await client.responses.parse({
      model: process.env.OPENAI_MODEL || "gpt-6.1-sol", store: false, instructions: sessionDraftInstructions,
      input: [{ role: "user", content }], max_output_tokens: 6000,
      text: { format: kind === "preparation" ? zodTextFormat(preparationProposalSchema, "session_preparation") : zodTextFormat(planProposalSchema, "study_plan") },
    });
    if (response.status !== "completed" || !response.output_parsed) throw new FormError("OpenAI could not complete this draft. Your saved work is unchanged.");
    if (kind === "preparation") {
      const proposal = preparationProposalSchema.parse(response.output_parsed);
      return { preparation: preparationSchema.parse({ ...proposal, topics: proposal.topics.map(topic => ({ ...topic,
        confidence: "not-asked", observation: "not-assessed", notes: "" })) }) };
    }
    const proposal = planProposalSchema.parse(response.output_parsed);
    return { plan: planDraftSchema.parse({ ...proposal, items: proposal.items.map(item => ({ ...item, id: crypto.randomUUID(), due_date: null })) }) };
  } catch (error) {
    if (error instanceof FormError) throw error;
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) throw new FormError("The OpenAI API key was rejected. Check the server's API setup.");
      if (error.status === 429) throw new FormError("OpenAI's usage or credit limit was reached. Check the API credit balance or try again later.");
    }
    throw new FormError("The AI draft could not be generated. Your saved work is unchanged; try again later or write the draft manually.");
  }
}
