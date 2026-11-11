"use client";

import { useSyncExternalStore } from "react";
import { ActionForm } from "@/lib/tutor/action-form";
import { sessionStatuses, type PersonOption } from "@/lib/tutor/fields";
import { Field } from "@/lib/tutor/ui";
import { saveSession } from "./actions";

type Session = {
  id: string;
  title: string;
  starts_at: string;
  duration_minutes: number;
  status: string;
  location: string;
};

function localInputValue(iso: string) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const subscribe = () => () => {};

export function SessionForm({ engagementId, roster, selected, session }: {
  engagementId: string;
  roster: (PersonOption & { deleted_at?: string | null })[];
  selected: string[];
  session?: Session;
}) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const startsAt = session?.starts_at;
  const localStart = hydrated && startsAt ? localInputValue(startsAt) : "";

  function save(form: FormData) {
    const local = form.get("local_start");
    if (typeof local === "string" && local) {
      const time = new Date(local);
      if (!Number.isNaN(time.getTime())) {
        if (localInputValue(time.toISOString()) !== local) {
          return Promise.resolve({ error: "That local time does not exist because of a daylight saving change. Choose another time." });
        }
        const iso = startsAt && localInputValue(startsAt) === local ? startsAt : time.toISOString();
        form.set("starts_at", iso);
      }
    }
    return saveSession(form);
  }

  return (
    <ActionForm action={save} label={session ? "Save session" : "Schedule session"}>
      {session && <input name="id" type="hidden" value={session.id} />}
      <input name="engagement_id" type="hidden" value={engagementId} />
      <Field name="session-focus" label="Focus (optional)"><input id="session-focus" name="focus" defaultValue={session?.title} maxLength={120} placeholder="Exam review" /></Field>
      <div className="form-grid">
        <Field name="session-start" label="Start date and time">
          <input id="session-start" type="datetime-local" name="local_start" key={localStart} defaultValue={localStart} aria-describedby="session-time-help" required />
          <p className="muted text-sm" id="session-time-help">Use the time zone on this device.</p>
        </Field>
        <Field name="session-duration" label="Duration in minutes">
          <input id="session-duration" type="number" name="duration_minutes" defaultValue={session?.duration_minutes ?? 60} min={5} max={480} required />
        </Field>
      </div>
      <Field name="session-location" label="Location or meeting link">
        <input id="session-location" name="location" defaultValue={session?.location} maxLength={500} />
      </Field>
      {session && <Field name="session-status" label="Status">
        <select id="session-status" name="status" defaultValue={session.status}>
          {sessionStatuses.map((status) => <option className="capitalize" key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
        </select>
      </Field>}
      <fieldset className="stack">
        <legend>Participants</legend>
        {roster.map((student) => (
          <label key={student.id} className="flex items-center gap-3">
            <input name="students" type="checkbox" value={student.id} defaultChecked={selected.includes(student.id)} disabled={!!student.deleted_at} />
            {student.deleted_at && selected.includes(student.id) && <input type="hidden" name="students" value={student.id} />}{student.name}{student.deleted_at ? " (deleted)" : ""}
          </label>
        ))}
      </fieldset>
    </ActionForm>
  );
}
