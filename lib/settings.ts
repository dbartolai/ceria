export const defaultSettings = {
  quizzes: true,
  materials: true,
  roadmaps: true,
  parentNotifications: true,
  goals: "",
  milestones: "",
  testPrep: "",
  quizPreferences: "",
};

export type Settings = typeof defaultSettings;

export function resolveSettings(
  engagement?: Partial<Settings> | null,
  student?: Partial<Settings> | null,
  enrollment?: Partial<Settings> | null,
): Settings {
  return {
    ...defaultSettings, ...engagement, ...student, ...enrollment,
    quizzes: true, materials: true, roadmaps: true, parentNotifications: true,
  };
}
