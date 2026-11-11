"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { uploadMaterialFile } from "./actions";

type PendingFile = { id: string; file: File };

export function FileUploader({ materialId }: { materialId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [feedback, setFeedback] = useState<{ message?: string; error?: string }>();
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !files.length) return;
    setFeedback(undefined);
    startTransition(async () => {
      let added = 0;
      for (const item of files) {
        const form = new FormData();
        form.set("material_id", materialId);
        form.set("upload_id", item.id);
        form.set("attachment", item.file);
        try {
          const result = await uploadMaterialFile(form);
          if ("error" in result) {
            setFeedback({ error: `${item.file.name}: ${result.error}` });
            router.refresh();
            return;
          }
        } catch {
          setFeedback({ error: `${item.file.name} could not be uploaded. Try again to continue.` });
          router.refresh();
          return;
        }
        added += 1;
        setFiles((remaining) => remaining.filter(({ id }) => id !== item.id));
      }
      if (input.current) input.current.value = "";
      setFeedback({ message: `${added} ${added === 1 ? "file added" : "files added"}.` });
      router.refresh();
    });
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label>
        Add files
        <input ref={input} type="file" multiple disabled={pending} accept=".pdf,.txt,.png,.jpg,.jpeg,.webp"
          onChange={(event) => {
            setFeedback(undefined);
            setFiles(Array.from(event.target.files ?? []).map((file) => ({ id: crypto.randomUUID(), file })));
          }} />
      </label>
      <p className="muted text-sm">PDF, text, PNG, JPEG, or WebP. Each file can be up to 4 MB.</p>
      {!!files.length && <ul className="muted text-sm">{files.map(({ id, file }) => <li key={id}>{file.name}</li>)}</ul>}
      <div><button className="button secondary" type="submit" disabled={pending || !files.length}>
        {pending ? "Uploading…" : "Upload files"}
      </button></div>
      {feedback?.error && <p className="notice error" role="alert">{feedback.error}</p>}
      {feedback?.message && <p className="muted" role="status">{feedback.message}</p>}
    </form>
  );
}
