"use client";

import { useState } from "react";
import { ActionForm } from "@/lib/tutor/action-form";
import { DraftEditor } from "@/lib/tutor/draft-editor";
import type { PersonOption } from "@/lib/tutor/fields";
import { Field } from "@/lib/tutor/ui";
import { saveMaterial } from "./actions";

export function MaterialForm({ engagementId, sessions = [], sessionId, students, context, material }: {
  engagementId: string;
  sessions?: { id: string; label: string; participants: string[] }[];
  sessionId?: string;
  students?: PersonOption[];
  context?: string;
  material?: { id: string; title: string; body: string; storage_path: string | null };
}) {
  const [session, setSession] = useState(sessionId ?? "");
  const sessionParticipants = sessions.find((item) => item.id === session)?.participants;
  const candidates = sessionParticipants ? students?.filter((student) => sessionParticipants.includes(student.id)) : students;

  return (
    <ActionForm action={saveMaterial} label={material ? "Save material draft" : "Create material draft"} reset={!!material}>
      <input name="engagement_id" type="hidden" value={engagementId} />
      {material && <input name="id" type="hidden" value={material.id} />}
      <DraftEditor variant="material" context={context} title={material?.title} body={material?.body}>
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
      </DraftEditor>
      <Field name="material-file" label={material?.storage_path ? "Replace attachment" : "Attachment"}>
        <input id="material-file" name="attachment" type="file" accept=".pdf,.txt,.png,.jpg,.jpeg,.webp" aria-describedby="file-help" />
        <p className="muted text-sm" id="file-help">PDF, text, PNG, JPEG, or WebP up to 4 MB.</p>
      </Field>
      {material?.storage_path && <label className="flex items-center gap-3"><input name="remove_attachment" type="checkbox" />Remove the current attachment</label>}
    </ActionForm>
  );
}
