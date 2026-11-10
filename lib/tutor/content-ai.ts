export const contentTemplates = {
  recap: {
    task: "Draft a student summary or guardian recap for a tutoring session. Use the audience named in the context.",
    format: { topics: "Comma-separated topics actually covered", body: "Recap with what we worked on, observed strengths, and next steps." },
  },
  plan: {
    task: "Draft a tutoring lesson plan.",
    format: { title: "Lesson title", body: "Objectives, worked examples, practice, and a short closing check." },
  },
  material: {
    task: "Create a standalone practice handout for a tutoring student.",
    format: { title: "Handout title", body: "A concise explanation, worked example, and independent practice." },
  },
} as const;

type ContentKind = keyof typeof contentTemplates;

export const contentGuidance = [
  "Use only the details in the context. Leave unsupported observations out.",
  "Do not include names, contact information, or other personal identifiers.",
  "Use clear paragraphs and plain text. Write inline mathematics between single dollar signs.",
];

export function draftSchema<T extends Record<string, number>>(fields: T) {
  return {
    parse(input: unknown) {
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Use a JSON object for the draft.");
      const result: Record<string, string> = {};
      for (const [field, max] of Object.entries(fields)) {
        const text = (input as Record<string, unknown>)[field];
        if (typeof text !== "string" || !text.trim() || text.length > max) {
          throw new Error(`Provide a non-empty "${field}" string of at most ${max} characters.`);
        }
        result[field] = text.trim();
      }
      return result as { [K in keyof T]: string };
    },
  };
}

export type { ContentKind };
