export function sessionLabel(session?: { title: string; engagements?: { title: string } | null }) {
  if (!session) return "Session";
  return [session.engagements?.title, session.title].filter(Boolean).join(" · ") || "Session";
}

export type TutorSessionRow = {
  id: string; title: string; starts_at: string; duration_minutes: number;
  status: "scheduled" | "completed" | "cancelled";
  engagements: { title: string } | null;
  session_students: { people: { name: string; deleted_at: string | null } | null }[];
};
