"use client";

import { useState, useTransition } from "react";
import { StudyPlanTasks } from "@/components/study-plan";
import { ActionForm } from "@/lib/tutor/action-form";
import { emptyPreparation, type PlanDraft, type Preparation, type StudyPlan } from "@/lib/study-plans/contracts";
import { publishStudyPlan, savePreparation, saveStudyPlan, unpublishStudyPlan } from "./actions";

function draftFromPlan(plan: StudyPlan | null): PlanDraft {
  return plan ? { title: plan.title, summary: plan.summary, items: [...plan.study_plan_items].sort((a,b) => a.position-b.position)
    .map(({ id, title, details, source, estimated_minutes, due_date }) => ({ id, title, details, source, estimated_minutes, due_date })) }
    : { title: "Study plan", summary: "", items: [] };
}

export function SessionWorkspace({ sessionId, studentId, initialPreparation, savedPlan, materials, aiReady }: {
  sessionId: string; studentId: string; initialPreparation: Preparation; savedPlan: StudyPlan | null;
  materials: { id: string; title: string; fileCount: number; related: boolean }[]; aiReady: boolean;
}) {
  const [preparation, setPreparation] = useState(initialPreparation);
  const [plan, setPlan] = useState(() => draftFromPlan(savedPlan));
  const [selected, setSelected] = useState(materials.filter(material => material.related).map(material => material.id));
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ error?: string; message?: string }>();
  const published = !!savedPlan?.published_at;
  const planDirty = JSON.stringify(plan) !== JSON.stringify(draftFromPlan(savedPlan));

  function updateTopic(index: number, updates: Partial<Preparation["topics"][number]>) {
    setPreparation(current => ({ ...current, topics: current.topics.map((topic, i) => i === index ? { ...topic, ...updates } : topic) }));
  }
  function updateItem(index: number, updates: Partial<PlanDraft["items"][number]>) {
    setPlan(current => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, ...updates } : item) }));
  }
  function generate(kind: "preparation" | "plan") {
    setFeedback(undefined);
    startTransition(async () => {
      try {
        const response = await fetch("/api/session-preparation", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, sessionId, studentId, materialIds: selected, preparation }) });
        const result = await response.json();
        if (!response.ok || result.error) { setFeedback({ error: result.error || "The draft could not be generated." }); return; }
        if (kind === "preparation") setPreparation(result.preparation);
        else setPlan(result.plan);
        setFeedback({ message: "Draft generated. Review and save your changes below." });
      } catch { setFeedback({ error: "The connection was interrupted. Your saved work is unchanged." }); }
    });
  }
  function contextFields() {
    return <><input type="hidden" name="session_id" value={sessionId} /><input type="hidden" name="student_id" value={studentId} /></>;
  }

  return <>
    <section className="panel stack">
      <h2>Session materials</h2>
      <p className="muted">Choose the materials to include in AI drafts. Selected files and this student’s session notes are sent to OpenAI.</p>
      {materials.length ? <div className="stack">{materials.map(material => <label className="row" key={material.id}>
        <input type="checkbox" checked={selected.includes(material.id)} disabled={pending} onChange={event => setSelected(current => event.target.checked
          ? [...current, material.id] : current.filter(id => id !== material.id))} />
        <span>{material.title} <small className="muted">{material.fileCount ? `· ${material.fileCount} ${material.fileCount === 1 ? "file" : "files"}` : "· text"}</small></span>
      </label>)}</div> : <p className="muted">Add learning materials from the session page, or write your preparation below.</p>}
      {!aiReady && <p className="notice">AI generation needs server API setup. You can write and save everything below manually.</p>}
      <div className="row flex-wrap">
        <button className="button" disabled={pending || !aiReady} onClick={() => generate("preparation")}>{pending ? "Generating…" : "Generate preparation"}</button>
        <p className="muted text-sm">Generated drafts need your review before saving or sharing.</p>
      </div>
      {feedback?.error && <p className="notice error" role="alert">{feedback.error}</p>}
      {feedback?.message && <p className="muted" role="status">{feedback.message}</p>}
    </section>
    <section className="panel stack">
      <h2>Preparation and live observations</h2>
      <ActionForm action={savePreparation} label="Save preparation" disabled={pending}>
        {contextFields()}<input type="hidden" name="preparation" value={JSON.stringify(preparation)} />
        <fieldset disabled={pending} className="stack min-w-0">
          <label>Session outline<textarea rows={4} maxLength={6000} value={preparation.summary} onChange={event => setPreparation(current => ({ ...current, summary: event.target.value }))} /></label>
          <p className="muted">Ask how the student feels, then record what you observe as they work. These notes stay private.</p>
          {preparation.topics.map((topic, index) => <details key={index} open={index === 0 || !topic.topic}>
            <summary>{topic.topic || `New topic ${index+1}`}</summary>
            <fieldset className="stack mt-4 rounded-xl border border-[var(--border)] p-4">
            <legend className="px-2">Topic {index+1}</legend>
            <div className="form-grid">
              <label>Topic<input maxLength={160} required value={topic.topic} onChange={event => updateTopic(index, { topic: event.target.value })} /></label>
              <label>Source or questions<input maxLength={500} value={topic.source} onChange={event => updateTopic(index, { source: event.target.value })} /></label>
            </div>
            <label>Diagnostic check<textarea rows={2} maxLength={1500} value={topic.check} onChange={event => updateTopic(index, { check: event.target.value })} /></label>
            <div className="form-grid">
              <label>Student confidence<select value={topic.confidence} onChange={event => updateTopic(index, { confidence: event.target.value as typeof topic.confidence })}>
                <option value="not-asked">Not asked yet</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select></label>
              <label>Observed understanding<select value={topic.observation} onChange={event => updateTopic(index, { observation: event.target.value as typeof topic.observation })}>
                <option value="not-assessed">Not assessed yet</option><option value="independent">Independent</option><option value="with-help">Needed help</option><option value="revisit">Revisit</option>
              </select></label>
            </div>
            <label>Observation notes<textarea rows={2} maxLength={1500} value={topic.notes} onChange={event => updateTopic(index, { notes: event.target.value })} /></label>
            <div><button className="button secondary" type="button" onClick={() => setPreparation(current => ({ ...current, topics: current.topics.filter((_,i) => i !== index) }))}>Remove topic</button></div>
          </fieldset></details>)}
          <div className="row flex-wrap">
            <button className="button secondary" type="button" disabled={preparation.topics.length >= 16} onClick={() => setPreparation(current => ({ ...current,
              topics: [...current.topics, { topic: "", source: "", check: "", confidence: "not-asked", observation: "not-assessed", notes: "" }] }))}>Add topic</button>
            <button className="button secondary" type="button" onClick={() => setPreparation(initialPreparation ?? emptyPreparation)}>Restore saved preparation</button>
          </div>
        </fieldset>
      </ActionForm>
    </section>
    <section className="panel stack">
      <div className="row spread flex-wrap"><h2>Study plan</h2><span className="muted">{published ? "Published" : "Private draft"}</span></div>
      {published && savedPlan ? <>
        <h3>{savedPlan.title}</h3><p className="prose-copy">{savedPlan.summary}</p><StudyPlanTasks plan={savedPlan} />
        <ActionForm action={unpublishStudyPlan} label="Return study plan to draft" secondary><input type="hidden" name="id" value={savedPlan.id} /></ActionForm>
      </> : <>
        <p className="muted">Turn the observations above into specific practice. Only the reviewed plan is shared with the student and linked guardians.</p>
        <div><button className="button secondary" disabled={pending || !aiReady} onClick={() => generate("plan")}>{pending ? "Generating…" : "Generate study plan"}</button></div>
        <ActionForm action={saveStudyPlan} label="Save study plan draft" disabled={pending}>
          {contextFields()}<input type="hidden" name="plan" value={JSON.stringify(plan)} />
          <fieldset className="stack min-w-0" disabled={pending}>
            <label>Plan title<input required maxLength={160} value={plan.title} onChange={event => setPlan(current => ({ ...current, title: event.target.value }))} /></label>
            <label>Plan summary<textarea rows={3} maxLength={6000} value={plan.summary} onChange={event => setPlan(current => ({ ...current, summary: event.target.value }))} /></label>
            {plan.items.map((item, index) => <fieldset className="stack rounded-xl border border-[var(--border)] p-4" key={item.id}>
              <legend className="px-2">Task {index+1}</legend>
              <label>Task title<input required maxLength={160} value={item.title} onChange={event => updateItem(index, { title: event.target.value })} /></label>
              <label>Practice and check<textarea rows={3} maxLength={3000} value={item.details} onChange={event => updateItem(index, { details: event.target.value })} /></label>
              <label>Reference<input maxLength={500} value={item.source} onChange={event => updateItem(index, { source: event.target.value })} /></label>
              <div className="form-grid">
                <label>Estimated minutes (optional)<input type="number" min={1} max={240} value={item.estimated_minutes ?? ""} onChange={event => updateItem(index, { estimated_minutes: event.target.value ? Number(event.target.value) : null })} /></label>
                <label>Due date (optional)<input type="date" value={item.due_date ?? ""} onChange={event => updateItem(index, { due_date: event.target.value || null })} /></label>
              </div>
              <div><button type="button" className="button secondary" onClick={() => setPlan(current => ({ ...current, items: current.items.filter((_,i) => i !== index) }))}>Remove task</button></div>
            </fieldset>)}
            <div className="row flex-wrap">
              <button type="button" className="button secondary" disabled={plan.items.length >= 30} onClick={() => setPlan(current => ({ ...current, items: [...current.items,
                { id: crypto.randomUUID(), title: "", details: "", source: "", estimated_minutes: null, due_date: null }] }))}>Add study task</button>
              {savedPlan && <button type="button" className="button secondary" onClick={() => setPlan(draftFromPlan(savedPlan))}>Restore saved plan</button>}
            </div>
          </fieldset>
        </ActionForm>
        {savedPlan && !planDirty && <ActionForm action={publishStudyPlan} label="Publish study plan" disabled={pending}><input type="hidden" name="id" value={savedPlan.id} />
          <p className="muted">Publishing shares this saved plan with the student and linked guardians.</p>
        </ActionForm>}
        {savedPlan && planDirty && <p className="muted">Save your changes before publishing.</p>}
      </>}
    </section>
  </>;
}
