'use client';

import { useRef, useState } from 'react';

export function PromptPanel({ prompt, label = 'Prompt' }: { prompt: string; label?: string }) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState('');

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setStatus('Prompt copied.');
    } catch {
      textarea.current?.focus();
      textarea.current?.select();
      setStatus('Prompt selected. Use your keyboard to copy it.');
    }
  }

  return (
    <div className="stack">
      <label>
        {label}
        <textarea ref={textarea} readOnly rows={8} value={prompt} />
      </label>
      <div className="row">
        <button type="button" className="button secondary" onClick={copy}>Copy prompt</button>
        <span className="muted" role="status">{status}</span>
      </div>
    </div>
  );
}
