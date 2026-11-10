import type { ReactNode } from "react";
import { defaultSettings, type Settings } from "@/lib/settings";

export type ActionResult = { error: string } | { message: string; href?: string };

export type PortalSettings = Partial<Settings>;

export const engagementKinds = ["one-off", "short-term", "ongoing"] as const;
export const sessionStatuses = ["scheduled", "completed", "cancelled"] as const;
export const invoiceStatuses = ["open", "paid", "void"] as const;

export const toggleSettings = [
  ["quizzes", "Quizzes and assignments", defaultSettings.quizzes],
  ["materials", "Learning materials", defaultSettings.materials],
  ["roadmaps", "Learning roadmap", defaultSettings.roadmaps],
  ["parentNotifications", "Parent notifications", defaultSettings.parentNotifications],
] as const;

export const textSettings = [
  ["goals", "Learning goals"],
  ["milestones", "Milestones"],
  ["testPrep", "Test preparation"],
  ["quizPreferences", "Quiz and assignment preferences"],
] as const;

export type PersonOption = { id: string; name: string };
export type FieldProps = { name: string; label: ReactNode; children: ReactNode };
