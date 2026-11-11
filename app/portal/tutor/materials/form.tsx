"use client";

import { useState } from "react";
import { ActionForm } from "@/lib/tutor/action-form";
import type { PersonOption } from "@/lib/tutor/fields";
import { Field } from "@/lib/tutor/ui";
import { saveMaterial } from "./actions";

export function MaterialForm({ engagementId, sessions = [], sessionId, students, material }: {
  engagementId: string;
  sessions?: { id: string; label: string; participants: string[] }[];
  sessionId?: string;
  students?: PersonOption[];
  material?: { id: string; title: string; body: string };
}) {
  const [session, setSession] = useState(sessionId ?? "");
  const sessionParticipants = sessions.find((item) => item.id === session)?.participants;
  const candidates = sessionParticipants ? students?.filter((student) => sessionParticipants.includes(student.id)) : students;

  return (
    <ActionForm action={saveMaterial} label={material ? "Save material draft" : "Create material draft"}>
      <input name="engagement_id" type="hidden" value={engagementId} />
      {material && <input name="id" type="hidden" value={material.id} />}
      {!material && <div className="form-grid">
        <Field name="material-session" label="Related session">
          <select id="material-session" name="session_id" value={session} onChange={(event) => setSession(event.target.value)}>
            <option value="">No related session</option>
            {sessions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </Field>
        <Field name="material-student" label="Share with">
          <select key={session} id="material-student" name="student_id" defaultValue="">
            <option value="">{session ? "Session participants" : "Engagement students"}</option>
            {candidates?.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
          </select>
        </Field>
      </div>}
      <Field name="material-title" label="Title">
        <input id="material-title" name="title" defaultValue={material?.title} maxLength={120} required />
      </Field>
      <Field name="material-body" label="Material text (optional)">
        <textarea id="material-body" name="body" rows={6} defaultValue={material?.body} maxLength={12000} />
      </Field>
      {!material && <p className="muted text-sm">Create the draft to add files.</p>}
    </ActionForm>
  );
}
