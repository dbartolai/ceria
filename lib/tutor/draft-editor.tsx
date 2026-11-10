"use client";

import { useId, useState, type ReactNode } from "react";
import { manualContentProvider } from "@/lib/ai/manual";
import { PromptPanel } from "@/lib/ai/prompt-panel";
import { contentGuidance, contentTemplates, draftSchema, type ContentKind } from "./content-ai";
import { Field } from "./ui";

export function DraftEditor({ variant, context = "", title = "", topics = "", body = "", children }: {
  variant: "recap" | "material";
  context?: string;
  title?: string;
  topics?: string;
  body?: string;
  children?: ReactNode;
}) {
  const id = useId();
  const [kind, setKind] = useState<ContentKind>(variant);
  const [promptContext, setPromptContext] = useState(context);
  const [prompt, setPrompt] = useState("");
  const [json, setJson] = useState("");
  const [titleValue, setTitle] = useState(title);
  const [topicsValue, setTopics] = useState(topics);
  const [bodyValue, setBody] = useState(body);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();

  function importDraft() {
    try {
      if (variant === "recap") {
        const draft = manualContentProvider.parse(json, draftSchema({ body: 12000, topics: 1500 }));
        setTopics(draft.topics);
        setBody(draft.body);
      } else {
        const draft = manualContentProvider.parse(json, draftSchema({ title: 120, body: 12000 }));
        setTitle(draft.title);
        setBody(draft.body);
      }
      setMessage({ text: "Draft imported. Review the fields before saving." });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "The draft could not be read." });
    }
  }

  return (
    <div className="stack">
      {children}
      <details>
        <summary>Draft with ChatGPT</summary>
        <div className="stack mt-4">
          {variant === "material" && <Field name={`${id}-kind`} label="Content type">
            <select id={`${id}-kind`} value={kind} onChange={(event) => setKind(event.target.value as ContentKind)}>
              <option value="material">Practice material</option>
              <option value="plan">Lesson plan</option>
            </select>
          </Field>}
          <Field name={`${id}-context`} label="Lesson context">
            <textarea id={`${id}-context`} rows={4} maxLength={6000} value={promptContext} onChange={(event) => setPromptContext(event.target.value)} />
          </Field>
          <p className="muted text-sm">Review the context and remove identifying details before copying it into ChatGPT.</p>
          <div><button type="button" className="button secondary" onClick={() => setPrompt(manualContentProvider.buildPrompt({
            ...contentTemplates[kind], context: promptContext, guidance: contentGuidance,
          }))}>Generate prompt</button></div>
          {prompt && <PromptPanel prompt={prompt} label="ChatGPT prompt" />}
          <Field name={`${id}-json`} label="ChatGPT response">
            <textarea id={`${id}-json`} rows={4} maxLength={60000} value={json} onChange={(event) => setJson(event.target.value)} spellCheck={false} />
          </Field>
          <div><button type="button" className="button secondary" onClick={importDraft}>Import draft</button></div>
          {message && <p className={message.error ? "notice error" : "muted"} role={message.error ? "alert" : "status"}>{message.text}</p>}
        </div>
      </details>
      {variant === "recap" ? <Field name={`${id}-topics`} label="Topics covered">
        <input id={`${id}-topics`} name="topics" value={topicsValue} onChange={(event) => setTopics(event.target.value)} maxLength={1500} />
      </Field> : <Field name={`${id}-title`} label="Title">
        <input id={`${id}-title`} name="title" value={titleValue} onChange={(event) => setTitle(event.target.value)} maxLength={120} required />
      </Field>}
      <Field name={`${id}-body`} label={variant === "recap" ? "Recap" : "Material text"}>
        <textarea id={`${id}-body`} name="body" rows={6} value={bodyValue} onChange={(event) => setBody(event.target.value)} maxLength={12000} required={variant === "recap"} />
      </Field>
    </div>
  );
}
