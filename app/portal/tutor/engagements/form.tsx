import { ActionForm } from "@/lib/tutor/action-form";
import { engagementKinds } from "@/lib/tutor/fields";
import { Field } from "@/lib/tutor/ui";
import { saveEngagement } from "./actions";

type Engagement = {
  id: string;
  title: string;
  kind: string;
  description: string;
};

const kindLabels = { "one-off": "One-off", "short-term": "Short-term", ongoing: "Ongoing" };

export function EngagementForm({ engagement }: { engagement?: Engagement }) {
  return (
    <ActionForm action={saveEngagement} label={engagement ? "Save engagement" : "Create engagement"}>
      {engagement && <input name="id" type="hidden" value={engagement.id} />}
      <Field name="engagement-title" label="Engagement name">
        <input id="engagement-title" name="title" defaultValue={engagement?.title} maxLength={120} placeholder="Trigonometry prep" required />
        <small className="muted">Use a subject or program name. Student names are shown separately in your workspace.</small>
      </Field>
      <Field name="engagement-kind" label="Engagement type">
        <select id="engagement-kind" name="kind" defaultValue={engagement?.kind ?? "ongoing"}>
          {engagementKinds.map((kind) => <option key={kind} value={kind}>{kindLabels[kind]}</option>)}
        </select>
      </Field>
      <Field name="engagement-description" label="Description">
        <textarea id="engagement-description" name="description" rows={3} defaultValue={engagement?.description} maxLength={3000} />
      </Field>

    </ActionForm>
  );
}
