import { z } from "zod";

export const topicSchema = z.object({
  topic: z.string().trim().min(1).max(160),
  source: z.string().max(500),
  check: z.string().max(1500),
  confidence: z.enum(["not-asked", "low", "medium", "high"]),
  observation: z.enum(["not-assessed", "independent", "with-help", "revisit"]),
  notes: z.string().max(1500),
});
export const preparationSchema = z.object({
  summary: z.string().max(6000),
  topics: z.array(topicSchema).max(16),
});
export type Preparation = z.infer<typeof preparationSchema>;
export const emptyPreparation: Preparation = { summary: "", topics: [] };

export const planItemSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(160),
  details: z.string().max(3000),
  source: z.string().max(500),
  estimated_minutes: z.number().int().min(1).max(240).nullable(),
  due_date: z.iso.date().nullable(),
});
export const planDraftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().max(6000),
  items: z.array(planItemSchema).min(1).max(30),
});
export type PlanDraft = z.infer<typeof planDraftSchema>;
export type StudyPlan = {
  id: string; session_id: string; student_id: string; title: string; summary: string;
  published_at: string | null; created_at: string;
  study_plan_items: (PlanDraft["items"][number] & { position: number; completed_at: string | null })[];
};

// AI proposes content. Observations, IDs, and due dates are supplied by the tutor.
export const preparationProposalSchema = z.object({
  summary: z.string(),
  topics: z.array(z.object({ topic: z.string(), source: z.string(), check: z.string() })),
});
export const planProposalSchema = z.object({
  title: z.string(), summary: z.string(),
  items: z.array(z.object({ title: z.string(), details: z.string(), source: z.string(), estimated_minutes: z.number().int().nullable() })),
});
