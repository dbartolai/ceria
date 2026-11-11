import type { ReactNode } from "react";

export type ActionResult = { error: string } | { message: string; href?: string };

export const engagementKinds = ["one-off", "short-term", "ongoing"] as const;
export const sessionStatuses = ["scheduled", "completed", "cancelled"] as const;
export const invoiceStatuses = ["open", "paid", "void"] as const;

export type PersonOption = { id: string; name: string };
export type FieldProps = { name: string; label: ReactNode; children: ReactNode };
