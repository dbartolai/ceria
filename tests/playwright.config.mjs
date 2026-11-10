import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const projectDirectory = fileURLToPath(new URL("../", import.meta.url));
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url)));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!apiUrl || !["127.0.0.1", "localhost"].includes(new URL(apiUrl).hostname)) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL to an isolated local stack before running end-to-end tests.");
}

const appUrl = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: ".",
  testMatch: "portal.spec.mjs",
  workers: 1,
  timeout: 90_000,
  outputDir: "../.artifacts/e2e",
  reporter: "list",
  use: { baseURL: appUrl, browserName: "chromium", actionTimeout: 15_000, navigationTimeout: 30_000 },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    cwd: projectDirectory,
    url: `${appUrl}/login`,
    timeout: 120_000,
  },
});
