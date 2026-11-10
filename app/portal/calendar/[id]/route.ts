import { requirePerson } from "@/lib/auth";
import { isUuid } from "@/lib/tutor/validation";

function text(value: string) {
  return value.replace(/[\\;,]/g, "\\$&").replace(/\r\n|\r|\n/g, "\\n");
}

function stamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function fold(line: string) {
  const encoder = new TextEncoder();
  const segments = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > 75) {
      segments.push(current);
      current = " ";
      size = 1;
    }
    current += char;
    size += bytes;
  }
  segments.push(current);
  return segments.join("\r\n");
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new Response(null, { status: 404 });
  const { db } = await requirePerson();
  const { data: session, error } = await db.from("sessions")
    .select("id,title,starts_at,duration_minutes,location,status").eq("id", id).maybeSingle();

  if (error) return new Response("Calendar event unavailable.", { status: 503 });
  if (!session || session.status === "cancelled") return new Response(null, { status: 404 });
  const startsAt = new Date(session.starts_at);
  const endsAt = new Date(startsAt.getTime() + session.duration_minutes * 60000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ceria//Tutoring//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${session.id}@ceria`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(startsAt)}`,
    `DTEND:${stamp(endsAt)}`,
    `SUMMARY:${text(session.title)}`,
    `LOCATION:${text(session.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ceria-session.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
