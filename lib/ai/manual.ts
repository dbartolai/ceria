export type ContentRequest = {
  task: string;
  context: string;
  format: unknown;
  guidance?: string[];
};

export interface ContentProvider {
  buildPrompt(request: ContentRequest): string;
  parse<T>(input: string, schema: { parse(value: unknown): T }): T;
}

export const manualContentProvider: ContentProvider = {
  buildPrompt({ task, context, format, guidance = [] }) {
    return [
      task.trim(),
      'Use the academic context below. Leave out names, email addresses, and other identifying details.',
      context.trim(),
      ...guidance,
      'Return one valid JSON object that follows this example structure. Use no Markdown fences or surrounding commentary.',
      JSON.stringify(format, null, 2),
    ].filter(Boolean).join('\n\n');
  },
  parse(input, schema) {
    const trimmed = input.trim();
    if (trimmed.length > 900_000) throw new Error('The import is too large. Split it into smaller drafts.');
    const json = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? trimmed;
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      throw new Error('Paste a valid JSON response and try again.');
    }
    return schema.parse(data);
  },
};
