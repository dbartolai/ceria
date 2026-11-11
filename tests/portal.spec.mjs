import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { startAiFixture } from "./ai-fixture.mjs";
import { fileURLToPath } from "node:url";
import { basename } from "node:path";
import { writeFile } from "node:fs/promises";

const mailpitUrl = process.env.TEST_MAILPIT_URL ?? "http://127.0.0.1:55324";
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const adminKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const storageBucket = "materials";

const fixture = {};
const cleanup = [];
let admin;
let aiFixture;

async function checked(operation, description) {
  const { data, error } = await operation;
  if (error) throw new Error(`${description}: ${error.message}`);
  return data;
}

async function insert(client, table, row) {
  return checked(client.from(table).insert(row).select().single(), `Insert ${table}`);
}

function remove(table, column, value) {
  cleanup.push(() => checked(admin.from(table).delete().eq(column, value), `Clean ${table}`));
}

function syntheticEmail(name) {
  return `ceria-${name}-${randomUUID().slice(0, 8)}@example.com`;
}

async function createPerson(role, name) {
  const email = syntheticEmail(role);
  const { user } = await checked(admin.auth.admin.createUser({ email, email_confirm: true }), `Create ${role} auth user`);
  cleanup.push(() => checked(admin.auth.admin.deleteUser(user.id), `Remove ${role} auth user`));
  const person = await insert(admin, "people", { email, name, role, auth_user_id: user.id });
  remove("people", "id", person.id);
  return person;
}

async function magicToken(email) {
  const { properties } = await checked(admin.auth.admin.generateLink({ type: "magiclink", email }), "Generate fixture sign-in link");
  return properties.hashed_token;
}

async function asPerson(person) {
  const client = createClient(apiUrl, publicKey, clientOptions);
  const token_hash = await magicToken(person.email);
  await checked(client.auth.verifyOtp({ type: "magiclink", token_hash }), `Authenticate fixture ${person.role}`);
  return client;
}

async function continueToPortal(page, path, expectedPath = "/portal") {
  await page.goto(path);
  await page.getByRole("button", { name: "Continue to portal" }).click();
  await expect(page).toHaveURL((url) => url.pathname === expectedPath && !url.search, { timeout: 30_000 });
}

async function signInFixture(page, person) {
  const dashboard = person.role === "tutor" ? "/portal/tutor" : "/portal";
  await continueToPortal(page, `/auth/confirm?token_hash=${await magicToken(person.email)}&type=magiclink`, dashboard);
}

async function emailedConfirmPath(email, type) {
  const url = new URL("/view/latest.html", mailpitUrl);
  url.searchParams.set("query", `to:${email}`);
  const link = /href="([^"]*\/auth\/confirm\?[^"]+)"/;
  let html = "";
  await expect.poll(async () => {
    const response = await fetch(url);
    html = response.ok ? await response.text() : "";
    return link.test(html);
  }, { timeout: 15_000, message: "Mailpit received the requested portal email" }).toBe(true);
  const confirmation = new URL(html.match(link)[1].replaceAll("&amp;", "&"));
  expect(confirmation.origin).toBe("http://127.0.0.1:3100");
  expect(confirmation.searchParams.get("type")).toBe(type);
  return `${confirmation.pathname}${confirmation.search}`;
}

async function saveSession(tutor, engagement, title, students, date, status = "scheduled") {
  const id = await checked(tutor.rpc("save_session", {
    p_id: null,
    p_engagement_id: engagement.id,
    p_title: title,
    p_starts_at: date,
    p_duration_minutes: 60,
    p_location: "https://meet.example.com/ceria",
    p_status: status,
    p_students: students.map(({ id }) => id),
  }), "Save session and participants");
  remove("sessions", "id", id);
  return id;
}

async function tableIds(client, table, ids) {
  const rows = await checked(client.from(table).select("id").in("id", ids), `Read ${table}`);
  return rows.map(({ id }) => id).sort();
}

test.beforeAll(async () => {
  aiFixture = await startAiFixture();
  if (!["127.0.0.1", "localhost"].includes(new URL(mailpitUrl).hostname)) {
    throw new Error("Set TEST_MAILPIT_URL to the local mail inbox before running end-to-end tests.");
  }
  if (!publicKey || !adminKey) throw new Error("Add the local Supabase publishable and secret keys to .env.local.");
  admin = createClient(apiUrl, adminKey, clientOptions);

  fixture.tutor = await checked(admin.from("people").select().eq("role", "tutor").limit(1).maybeSingle(), "Find existing local tutor")
    ?? await createPerson("tutor", "ceria Test Tutor");
  fixture.student = await createPerson("student", "Mira Test");
  fixture.peer = await createPerson("student", "Jules Test");
  fixture.outsider = await createPerson("student", "Ana Test");
  fixture.guardian = await createPerson("guardian", "Morgan Test");
  fixture.otherGuardian = await createPerson("guardian", "Taylor Test");
  fixture.tutorDb = await asPerson(fixture.tutor);
  const tutor = fixture.tutorDb;
  const { student, peer, outsider, guardian, otherGuardian } = fixture;

  fixture.group = await insert(tutor, "engagements", { title: "Algebra studio", kind: "ongoing" });
  remove("engagements", "id", fixture.group.id);
  fixture.individual = await insert(tutor, "engagements", { title: "Geometry review", kind: "one-off" });
  remove("engagements", "id", fixture.individual.id);
  await checked(tutor.from("engagement_students").insert([
    { engagement_id: fixture.group.id, student_id: student.id },
    { engagement_id: fixture.group.id, student_id: peer.id },
    { engagement_id: fixture.individual.id, student_id: outsider.id },
  ]), "Set up group and individual rosters");
  await checked(tutor.from("guardians").insert([
    { guardian_id: guardian.id, student_id: student.id },
    { guardian_id: guardian.id, student_id: outsider.id },
    { guardian_id: otherGuardian.id, student_id: student.id },
  ]), "Set up many-to-many guardian links");

  const future = new Date(Date.now() + 86_400_000 * 3).toISOString();
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  fixture.groupSession = await saveSession(tutor, fixture.group, "Linear equations clinic", [student, peer], yesterday, "completed");
  fixture.individualSession = await saveSession(tutor, fixture.individual, "Geometry one-on-one", [outsider], future);
  await checked(tutor.from("session_notes").insert({
    session_id: fixture.groupSession, student_id: peer.id, topics: "Peer-only tutor notes",
  }), "Create a tutor-only student note");
  remove("session_notes", "session_id", fixture.groupSession);
  fixture.recaps = await checked(tutor.from("recaps").insert([
    { session_id: fixture.groupSession, student_id: student.id, audience: "student", body: "Mira’s individual feedback" },
    { session_id: fixture.groupSession, student_id: peer.id, audience: "student", body: "Jules’s individual feedback" },
    { session_id: fixture.groupSession, student_id: student.id, audience: "guardian", body: "Mira explored linear equations" },
    { session_id: fixture.groupSession, student_id: peer.id, audience: "guardian", body: "Jules explored linear equations" },
    { session_id: fixture.groupSession, student_id: null, audience: "guardian", body: "Draft recap awaiting approval" },
  ]).select("id,body"), "Create separate student and guardian recaps");
  remove("recaps", "session_id", fixture.groupSession);
  for (const { id } of fixture.recaps.slice(0, 4)) {
    await checked(tutor.rpc("publish_recap", { p_id: id }), "Publish session recap");
  }

  fixture.storagePath = `${fixture.group.id}/${randomUUID()}/study-notes.pdf`;
  const document = new Blob(["%PDF-1.4 synthetic attachment"], { type: "application/pdf" });
  await checked(tutor.storage.from(storageBucket).upload(fixture.storagePath, document), "Upload private attachment");
  cleanup.push(() => checked(admin.storage.from(storageBucket).remove([fixture.storagePath]), "Remove private attachment"));
  remove("materials", "engagement_id", fixture.group.id);
  fixture.shared = await insert(tutor, "materials", {
    engagement_id: fixture.group.id, title: "Group study notes", storage_path: fixture.storagePath,
  });
  fixture.private = await insert(tutor, "materials", {
    engagement_id: fixture.group.id, student_id: student.id, title: "Mira’s extra problems", body: "Practice with the assigned equation set.",
  });
  fixture.draft = await insert(tutor, "materials", {
    engagement_id: fixture.group.id, title: "Unapproved materials",
  });
  for (const material of [fixture.shared, fixture.private]) {
    await checked(tutor.rpc("publish_material", { p_id: material.id }), "Publish learning material");
  }

  const invoiceUrl = "https://invoice.stripe.com/i/ceria-fixture";
  fixture.invoice = await insert(tutor, "invoices", {
    student_id: student.id, title: "Mira’s tutoring invoice", amount_cents: 7500, currency: "usd",
    status: "open", hosted_url: invoiceUrl,
  });
  remove("invoices", "id", fixture.invoice.id);
  fixture.otherInvoice = await insert(tutor, "invoices", {
    student_id: peer.id, title: "Jules’s tutoring invoice", amount_cents: 7500, currency: "usd",
    status: "paid", hosted_url: "https://invoice.stripe.com/i/ceria-other-fixture",
  });
  remove("invoices", "id", fixture.otherInvoice.id);
  await checked(tutor.from("payment_portals").insert({
    guardian_id: guardian.id, hosted_url: "https://billing.stripe.com/p/login/ceria-fixture",
  }), "Set up Stripe-hosted payment management link");
});

test.afterAll(async () => {
  const failures = [];
  for (const dispose of cleanup.reverse()) {
    try {
      await dispose();
    } catch (error) {
      failures.push(error);
    }
  }
  await aiFixture?.close();
  if (failures.length) throw new AggregateError(failures, "Fixture cleanup failed");
});

test("tutor invites a student and their email link works once", async ({ page, browser }) => {
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await page.getByLabel("Email address").fill(fixture.tutor.email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await continueToPortal(page, await emailedConfirmPath(fixture.tutor.email, "magiclink"), "/portal/tutor");
  await page.goto("/portal/tutor/clients");
  const inviteeEmail = syntheticEmail("invitee");
  remove("people", "email", inviteeEmail);
  await page.getByLabel("Name", { exact: true }).fill("Nico Test");
  await page.getByLabel("Email (optional)", { exact: true }).fill(inviteeEmail);
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByRole("heading", { name: "Nico Test" })).toBeVisible();
  await page.getByRole("button", { name: "Send invitation" }).click();

  const path = await emailedConfirmPath(inviteeEmail, "invite");
  const browserContext = await browser.newContext();
  try {
    const studentPage = await browserContext.newPage();
    await studentPage.goto(path);
    await expect(studentPage.getByRole("button", { name: "Continue to portal" })).toBeVisible();
    await studentPage.goto("/portal");
    await expect(studentPage).toHaveURL(/\/login(?:\?|$)/);
    await continueToPortal(studentPage, path);
    await studentPage.reload();
    await expect(studentPage).toHaveURL(/\/portal\/?$/);
    const person = await checked(admin.from("people").select("auth_user_id").eq("email", inviteeEmail).single(), "Read accepted invitation");
    expect(person.auth_user_id).toBeTruthy();
    cleanup.push(() => checked(admin.auth.admin.deleteUser(person.auth_user_id), "Remove invited auth user"));
    await studentPage.getByRole("button", { name: "Sign out" }).click();
    await expect(studentPage).toHaveURL(/\/login$/);
    await studentPage.goto("/portal");
    await expect(studentPage).toHaveURL(/\/login$/);
  } finally {
    await browserContext.close();
  }

  const replay = await browser.newPage();
  try {
    await replay.goto(path);
    await replay.getByRole("button", { name: "Continue to portal" }).click();
    await expect(replay).toHaveURL(/\/login\?state=expired$/);
  } finally {
    await replay.close();
  }
});

test("tutor copies one-time links for a new student and a returning guardian", async ({ page, context, browser }, testInfo) => {
  const student = await insert(fixture.tutorDb, "people", {
    role: "student", name: "Avery Test", email: syntheticEmail("manual-invite"),
  });
  remove("people", "id", student.id);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signInFixture(page, fixture.tutor);
  await page.goto(`/portal/tutor/clients/${student.id}`);

  async function copyLink(type) {
    const button = page.getByRole("button", { name: "Copy sign-in link" });
    await expect(async () => {
      await button.click({ timeout: 1000 });
      await expect(page.getByText("Sign-in link copied.", { exact: false })).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 8000 });
    const link = new URL(await page.evaluate(() => navigator.clipboard.readText()));
    expect(link.origin).toBe("http://127.0.0.1:3100");
    expect(link.pathname).toBe("/auth/confirm");
    expect(link.searchParams.get("type")).toBe(type);
    return link.pathname + link.search;
  }

  const invite = await copyLink("invite");
  await page.locator("section").filter({ has: page.getByRole("heading", { name: "Portal access" }) })
    .screenshot({ path: testInfo.outputPath("copy-sign-in-link.png") });
  const mailSearch = new URL("/view/latest.html", mailpitUrl);
  mailSearch.searchParams.set("query", `to:${student.email}`);
  const message = await fetch(mailSearch);
  expect((await message.text()).includes("/auth/confirm?")).toBe(false);

  const studentPage = await browser.newPage();
  try {
    await studentPage.goto(invite);
    await expect(studentPage.getByRole("button", { name: "Continue to portal" })).toBeVisible();
    await continueToPortal(studentPage, invite);
    await expect(studentPage.getByRole("heading", { name: "Your learning desk" })).toBeVisible();
    const { auth_user_id } = await checked(admin.from("people").select("auth_user_id").eq("id", student.id).single(), "Read manually invited client");
    expect(auth_user_id).toBeTruthy();
    cleanup.push(() => checked(admin.auth.admin.deleteUser(auth_user_id), "Remove manually invited user"));
    await studentPage.getByRole("button", { name: "Sign out" }).click();
    await expect(studentPage).toHaveURL(/\/login$/);
    await studentPage.goto(invite);
    await studentPage.getByRole("button", { name: "Continue to portal" }).click();
    await expect(studentPage).toHaveURL(/\/login\?state=expired$/);
  } finally {
    await studentPage.close();
  }

  await page.goto(`/portal/tutor/clients/${fixture.guardian.id}`);
  const signIn = await copyLink("magiclink");
  const guardianPage = await browser.newPage();
  try {
    await continueToPortal(guardianPage, signIn);
    await expect(guardianPage.getByRole("heading", { name: "Family portal" })).toBeVisible();
    await guardianPage.goto(`/portal/tutor/clients/${student.id}`);
    await expect(guardianPage).toHaveURL(/\/portal$/);
    await expect(guardianPage.getByRole("button", { name: "Copy sign-in link" })).toHaveCount(0);
  } finally {
    await guardianPage.close();
  }

  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      value: async () => { throw new DOMException("Clipboard blocked", "NotAllowedError"); },
    });
  });
  await page.getByRole("button", { name: "Copy sign-in link" }).click();
  const fallback = page.getByRole("textbox", { name: "Copy this one-time sign-in link" });
  await expect(fallback).toBeVisible();
  expect(new URL(await fallback.inputValue()).searchParams.get("type")).toBe("magiclink");
});

test("clients without email use static profiles and explicit editing", async ({ page, context }, testInfo) => {
  await signInFixture(page, fixture.tutor);
  await page.goto("/portal/tutor/clients");
  await page.screenshot({ path: testInfo.outputPath("client-directory.png"), fullPage: true, caret: "initial" });
  await page.getByLabel("Name", { exact: true }).fill("Email-free student");
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByRole("heading", { name: "Email-free student", exact: true })).toBeVisible();
  const clientId = new URL(page.url()).pathname.split("/").at(-1);
  remove("people", "id", clientId);
  const profile = await checked(admin.from("people").select("email").eq("id", clientId).single(), "Read client without email");
  expect(profile.email).toBeNull();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy dashboard link", exact: true }).click();
  await expect(page.getByText("Sign-in link copied.", { exact: false })).toBeVisible();
  const linked = await checked(admin.from("people").select("auth_user_id,email").eq("id", clientId).single(), "Read email-free identity");
  expect(linked.auth_user_id).toBeTruthy();
  expect(linked.email).toBeNull();
  cleanup.push(() => checked(admin.auth.admin.deleteUser(linked.auth_user_id), "Clean email-free identity"));
  await expect(page.getByRole("button", { name: "Save profile" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy sign-in link" })).toHaveCount(0);
  await page.getByRole("link", { name: "Add email", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save profile" })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Email-free student updated");
  const email = syntheticEmail("optional");
  await page.getByLabel("Email (optional)", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page).toHaveURL((url) => !url.search);
  await expect(page.getByRole("heading", { name: "Email-free student updated", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy sign-in link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save profile" })).toHaveCount(0);
  await expect(page.getByText("Use default", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("static-client-profile.png"), fullPage: true });

  await page.goto(`/portal/tutor/engagements/${fixture.group.id}`);
  await expect(page.getByRole("button", { name: "Save engagement" })).toHaveCount(0);
  await page.getByRole("link", { name: "Edit engagement", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save engagement" })).toBeVisible();
  await expect(page.getByText("Use default", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save engagement" })).toHaveCount(0);
});

test("multiple material files upload separately and keep individual access private", async ({ page, browser }, testInfo) => {
  const { tutorDb, student, peer, group } = fixture;
  const material = await insert(tutorDb, "materials", {
    engagement_id: group.id, student_id: student.id, title: "Multi-file practice", body: "",
  });
  remove("materials", "id", material.id);
  const { error: emptyPublishError } = await tutorDb.rpc("publish_material", { p_id: material.id });
  expect(emptyPublishError?.message).toContain("Add material text or a file");
  await signInFixture(page, fixture.tutor);
  await page.goto(`/portal/tutor/materials/${material.id}`);
  await page.getByLabel("Add files", { exact: true }).setInputFiles([
    { name: "notes-one.txt", mimeType: "text/plain", buffer: Buffer.alloc(2_500_000, "a") },
    { name: "notes-two.txt", mimeType: "text/plain", buffer: Buffer.alloc(2_500_000, "b") },
  ]);
  await page.getByRole("button", { name: "Upload files", exact: true }).click();
  await expect(page.getByText("2 files added.", { exact: true })).toBeVisible({ timeout: 25000 });
  const files = await checked(tutorDb.from("material_attachments").select("*").eq("material_id", material.id).order("filename"), "Read multiple uploaded files");
  expect(files.map(({ filename }) => filename)).toEqual(["notes-one.txt", "notes-two.txt"]);
  cleanup.push(() => checked(admin.storage.from(storageBucket).remove(files.map(({ storage_path }) => storage_path)), "Remove multi-file storage objects"));
  const repeated = await checked(tutorDb.rpc("add_material_attachment", {
    p_material_id: material.id, p_storage_path: files[0].storage_path,
    p_filename: files[0].filename, p_size_bytes: files[0].size_bytes,
  }), "Retry attachment registration");
  expect(repeated).toBe(files[0].id);

  await page.getByRole("button", { name: "Publish material", exact: true }).click();
  await expect(page.getByText("Material published.", { exact: true })).toBeVisible();
  const [studentDb, peerDb] = await Promise.all([asPerson(student), asPerson(peer)]);
  expect(await checked(peerDb.from("material_attachments").select("id").eq("material_id", material.id), "Check peer attachment privacy")).toEqual([]);
  const { error: privateFileError } = await peerDb.storage.from(storageBucket).createSignedUrl(files[0].storage_path, 60);
  expect(privateFileError).toBeTruthy();
  const { error: publishedRemoval } = await studentDb.rpc("remove_material_attachment", { p_id: files[0].id });
  expect(publishedRemoval).toBeTruthy();
  const studentPage = await browser.newPage();
  try {
    await signInFixture(studentPage, student);
    await studentPage.goto("/portal/materials");
    const materialLink = studentPage.getByRole("link", { name: "Multi-file practice", exact: true });
    await expect(materialLink).toHaveAttribute("target", "_blank");
    const rowHeadings = materialLink.locator("xpath=ancestor::article").getByRole("heading");
    const typography = await rowHeadings.evaluateAll(elements => elements.map(element => ({ size: getComputedStyle(element).fontSize, weight: getComputedStyle(element).fontWeight })));
    expect(typography[0]).toEqual(typography[1]);
    await studentPage.screenshot({ path: testInfo.outputPath("material-document-list.png"), fullPage: true });
    const popup = studentPage.waitForEvent("popup");
    await materialLink.click();
    const documentPage = await popup;
    await expect(documentPage.getByRole("heading", { name: "Multi-file practice", exact: true })).toBeVisible();
    const links = documentPage.getByRole("link", { name: /notes-(one|two)\.txt/ });
    await expect(links).toHaveCount(2);
    await expect(documentPage.locator("iframe.document-text")).toHaveCount(2);
    const download = await documentPage.request.get(await links.first().getAttribute("href"));
    expect(download.headers()["content-disposition"]).toContain("inline");
    expect(download.headers()["x-frame-options"]).toBe("SAMEORIGIN");
    await documentPage.close();
    expect(download.status()).toBe(200);
    expect((await download.body()).length).toBe(2_500_000);
    await studentPage.screenshot({ path: testInfo.outputPath("multiple-material-files.png"), fullPage: true });
  } finally {
    await studentPage.close();
  }
  expect((await checked(studentDb.from("material_attachments").select("id").eq("material_id", material.id), "Read student attachment rows")).length).toBe(2);

  await page.getByRole("button", { name: "Return to draft", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove file", exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Remove file", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Remove file", exact: true })).toHaveCount(1);
});

test("group sessions, recaps, and files follow roster and publication rules", async () => {
  const { tutorDb, student, peer, outsider, group, groupSession, individualSession, recaps, shared, private: personal, draft } = fixture;
  const [studentDb, peerDb, outsiderDb] = await Promise.all([asPerson(student), asPerson(peer), asPerson(outsider)]);
  const sessionIds = [groupSession, individualSession];
  expect(await tableIds(studentDb, "sessions", sessionIds)).toEqual([groupSession]);
  expect(await tableIds(peerDb, "sessions", sessionIds)).toEqual([groupSession]);
  expect(await tableIds(outsiderDb, "sessions", sessionIds)).toEqual([individualSession]);

  expect(await tableIds(studentDb, "people", [student.id, peer.id, outsider.id])).toEqual([student.id]);
  const roster = await checked(studentDb.from("session_students").select("student_id").eq("session_id", groupSession), "Read student session participation");
  expect(roster).toEqual([{ student_id: student.id }]);
  const notes = await checked(peerDb.from("session_notes").select().eq("session_id", groupSession), "Check private notes");
  expect(notes).toEqual([]);
  const recapIds = recaps.map(({ id }) => id);
  expect(await tableIds(studentDb, "recaps", recapIds)).toEqual([recaps[0].id]);
  expect(await tableIds(peerDb, "recaps", recapIds)).toEqual([recaps[1].id]);

  const materialIds = [shared.id, personal.id, draft.id];
  expect(await tableIds(studentDb, "materials", materialIds)).toEqual([shared.id, personal.id].sort());
  expect(await tableIds(peerDb, "materials", materialIds)).toEqual([shared.id]);
  expect(await tableIds(outsiderDb, "materials", materialIds)).toEqual([]);
  await checked(studentDb.storage.from(storageBucket).createSignedUrl(fixture.storagePath, 60), "Sign permitted attachment");
  const { error: storageError } = await outsiderDb.storage.from(storageBucket).createSignedUrl(fixture.storagePath, 60);
  expect(storageError).toBeTruthy();

  const { error: invalidRoster } = await tutorDb.rpc("save_session", {
    p_id: groupSession, p_engagement_id: group.id, p_title: "Invalid roster",
    p_starts_at: new Date().toISOString(), p_duration_minutes: 30, p_location: "",
    p_status: "scheduled", p_students: [student.id, outsider.id],
  });
  expect(invalidRoster).toBeTruthy();
  const unchanged = await checked(tutorDb.from("sessions").select("title,status").eq("id", groupSession).single(), "Check failed edit rolled back");
  expect(unchanged).toEqual({ title: "Linear equations clinic", status: "completed" });
});

async function publishGroupQuiz(browser, tutorDb, group) {
  const draft = {
    title: "Linear equations practice",
    description: "Check your reasoning.",
    questions: [
      {
        kind: "multiple-choice", prompt: "What is twice six?", topic: "Multiplication", choices: ["8", "12"],
        answer: "12", explanation: "Add six to itself.", tolerance: 0,
      },
      {
        kind: "numeric", prompt: "Evaluate the square root of nine.", topic: "Radicals", choices: [],
        answer: "3", explanation: "Three squared equals nine.", tolerance: 0,
      },
      {
        kind: "short-answer", prompt: "Explain why checking a solution is useful.", topic: "Reasoning", choices: [],
        answer: "Substitute the value into the original equation.", explanation: "Both sides should match.", tolerance: 0,
      },
    ],
  };
  const tutorPage = await browser.newPage();
  try {
    await signInFixture(tutorPage, fixture.tutor);
    await tutorPage.goto("/portal/tutor/quizzes/new");
    await tutorPage.getByText("Import quiz JSON").click();
    const importField = tutorPage.getByLabel("Paste quiz JSON");
    await importField.fill(JSON.stringify({ title: "" }));
    await tutorPage.getByRole("button", { name: "Load draft" }).click();
    await expect(tutorPage.getByRole("alert").filter({ hasText: "Quiz title is required" })).toBeVisible();
    await importField.fill(JSON.stringify(draft));
    await tutorPage.getByRole("button", { name: "Load draft" }).click();
    await expect(tutorPage.getByLabel("Quiz title")).toHaveValue(draft.title);
    await tutorPage.getByRole("group", { name: "Question 1", exact: true })
      .getByLabel("Explanation").fill("Six plus six equals twelve.");
    await tutorPage.getByRole("button", { name: "Save draft" }).click();
    await expect(tutorPage).toHaveURL(/\/portal\/tutor\/quizzes\/[0-9a-f-]+$/);
    const quizId = new URL(tutorPage.url()).pathname.split("/").at(-1);
    remove("quizzes", "id", quizId);
    expect(await checked(tutorDb.from("assignments").select("id").eq("quiz_id", quizId), "Check quiz starts as a draft")).toEqual([]);

    const engagementPicker = tutorPage.getByRole("combobox", { name: "Engagement", exact: true });
    await engagementPicker.selectOption(group.id);
    await expect(engagementPicker).toHaveValue(group.id);
    await tutorPage.getByRole("button", { name: "Publish assignment" }).click();
    await expect(tutorPage.getByText("Assignment published. Students were notified in their portal.")).toBeVisible();
    const { id: assignmentId } = await checked(tutorDb.from("assignments").select("id").eq("quiz_id", quizId).single(), "Read published group quiz");
    remove("assignments", "id", assignmentId);
    remove("submissions", "assignment_id", assignmentId);
    return { quizId, assignmentId, draft };
  } finally {
    await tutorPage.close();
  }
}

test("a group quiz can be submitted and reviewed without sharing answers with peers", async ({ page, browser }, testInfo) => {
  const { tutorDb, student, peer, outsider, guardian, group } = fixture;
  const { quizId, assignmentId, draft } = await publishGroupQuiz(browser, tutorDb, group);
  const [studentDb, peerDb, outsiderDb, guardianDb] = await Promise.all([asPerson(student), asPerson(peer), asPerson(outsider), asPerson(guardian)]);
  expect(await tableIds(peerDb, "assignments", [assignmentId])).toEqual([assignmentId]);
  expect(await tableIds(outsiderDb, "assignments", [assignmentId])).toEqual([]);
  expect(await tableIds(guardianDb, "assignments", [assignmentId])).toEqual([]);
  const individualAssignmentId = await checked(tutorDb.rpc("publish_quiz_assignment", {
    p_quiz_id: quizId, p_engagement_id: group.id, p_student_ids: [student.id], p_due_at: null,
  }), "Reuse the quiz in an individual assignment");
  remove("assignments", "id", individualAssignmentId);
  expect(await tableIds(studentDb, "assignments", [individualAssignmentId])).toEqual([individualAssignmentId]);
  expect(await tableIds(peerDb, "assignments", [individualAssignmentId])).toEqual([]);
  await checked(tutorDb.from("engagement_students").update({ settings: { quizzes: false } })
    .eq("engagement_id", group.id).eq("student_id", peer.id), "Disable quiz access for one participant");
  expect(await tableIds(peerDb, "assignments", [assignmentId])).toEqual([assignmentId]);
  await checked(tutorDb.from("engagement_students").update({ settings: {} })
    .eq("engagement_id", group.id).eq("student_id", peer.id), "Restore default quiz access");
  expect(await tableIds(peerDb, "assignments", [assignmentId])).toEqual([assignmentId]);
  expect(await tableIds(studentDb, "quizzes", [quizId])).toEqual([]);
  const { error: forbiddenSubmission } = await outsiderDb.rpc("submit_quiz", { p_assignment_id: assignmentId, p_answers: ["12", "3", "Check both sides."] });
  expect(forbiddenSubmission).toBeTruthy();
  const updatedQuestions = draft.questions.map((question) => ({ ...question, prompt: "Edited draft prompt" }));
  await checked(tutorDb.from("quizzes").update({ questions: updatedQuestions }).eq("id", quizId), "Edit reusable quiz after assignment");
  const prompts = await checked(studentDb.from("assignment_questions").select("*").eq("assignment_id", assignmentId), "Read quiz questions before submission");
  expect(prompts).toHaveLength(3);
  expect(prompts.map(({ prompt }) => prompt)).toContain("What is twice six?");
  expect(prompts.every((prompt) => !("answer" in prompt) && !("explanation" in prompt))).toBe(true);

  await signInFixture(page, student);
  const assignmentPath = `/portal/assignments/${assignmentId}`;
  await page.goto(assignmentPath);
  await page.getByRole("radio", { name: /\b12\b/ }).check();
  await page.screenshot({ path: testInfo.outputPath("quiz-question.png"), fullPage: true });
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByLabel("Your answer").fill("3");
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByLabel("Your answer").fill("Try the value in the original equation to see if both sides match.");
  await page.getByRole("button", { name: "Submit quiz" }).click();
  await expect(page.getByRole("heading", { name: "Review your answers" })).toBeVisible();
  await expect(page.getByText("Six plus six equals twelve.")).toBeVisible();

  const submission = await checked(studentDb.from("submissions").select("*").eq("assignment_id", assignmentId).single(), "Read submitted quiz");
  expect(submission).toMatchObject({ score: 2, total: 3, pending_count: 1, student_id: student.id });
  for (const otherRole of [peerDb, outsiderDb, guardianDb]) {
    expect(await tableIds(otherRole, "submissions", [submission.id])).toEqual([]);
    expect(await checked(otherRole.from("submission_answers").select("*").eq("submission_id", submission.id), "Check quiz answer privacy")).toEqual([]);
  }

  const duplicate = await checked(studentDb.rpc("submit_quiz", { p_assignment_id: assignmentId, p_answers: ["8", "1", "New answers"] }), "Retry quiz submission");
  expect(duplicate).toBe(submission.id);
  const grade = {
    p_submission_id: submission.id, p_position: 3, p_correct: true, p_feedback: "Clear reasoning and a complete check.",
  };
  const { error: forbiddenGrade } = await peerDb.rpc("grade_quiz_answer", grade);
  expect(forbiddenGrade).toBeTruthy();
  const tutorPage = await browser.newPage();
  try {
    await signInFixture(tutorPage, fixture.tutor);
    await tutorPage.goto(`/portal/tutor/quizzes/submissions/${submission.id}`);
    const review = tutorPage.getByRole("group", { name: "Question 3 grade" });
    await review.getByRole("combobox", { name: "Grade", exact: true }).selectOption("correct");
    await review.getByLabel("Feedback").fill(grade.p_feedback);
    await review.getByRole("button", { name: "Save grade" }).click();
    await expect.poll(async () => {
      const result = await checked(studentDb.from("submissions").select("pending_count").eq("id", submission.id).single(), "Read quiz review status");
      return result.pending_count;
    }).toBe(0);
  } finally {
    await tutorPage.close();
  }
  await page.reload();
  await expect(page.getByText("Clear reasoning and a complete check.")).toBeVisible();
  const graded = await checked(studentDb.from("submissions").select("*").eq("id", submission.id).single(), "Read reviewed submission");
  expect(graded).toMatchObject({ score: 3, total: 3, pending_count: 0 });
  await page.screenshot({ path: testInfo.outputPath("quiz-reviewed.png"), fullPage: true });
});

test("guardians see linked sessions, approved recaps, and hosted billing", async ({ page }, testInfo) => {
  const { student, peer, outsider, guardian, otherGuardian, group, individual, groupSession, individualSession, recaps, invoice, otherInvoice } = fixture;
  const [guardianDb, otherGuardianDb, studentDb] = await Promise.all([asPerson(guardian), asPerson(otherGuardian), asPerson(student)]);
  expect(await tableIds(guardianDb, "sessions", [groupSession, individualSession])).toEqual([groupSession, individualSession].sort());
  expect(await tableIds(otherGuardianDb, "sessions", [groupSession, individualSession])).toEqual([groupSession]);
  expect(await tableIds(guardianDb, "people", [student.id, peer.id, outsider.id])).toEqual([]);
  expect(await tableIds(guardianDb, "engagements", [group.id, individual.id])).toEqual([group.id, individual.id].sort());
  expect(await tableIds(otherGuardianDb, "engagements", [group.id, individual.id])).toEqual([group.id]);
  const linked = await checked(guardianDb.rpc("linked_students"), "Read guardian's limited linked student directory");
  expect(linked.sort((first, second) => first.name.localeCompare(second.name))).toEqual([
    { id: outsider.id, name: outsider.name },
    { id: student.id, name: student.name },
  ]);
  expect(await tableIds(guardianDb, "recaps", recaps.map(({ id }) => id))).toEqual([recaps[2].id]);
  expect(await tableIds(otherGuardianDb, "recaps", recaps.map(({ id }) => id))).toEqual([recaps[2].id]);
  expect(await tableIds(guardianDb, "invoices", [invoice.id, otherInvoice.id])).toEqual([invoice.id]);
  expect(await tableIds(studentDb, "invoices", [invoice.id])).toEqual([]);
  const portals = await checked(otherGuardianDb.from("payment_portals").select().eq("guardian_id", guardian.id), "Check billing links are private to the configured guardian");
  expect(portals).toEqual([]);

  await signInFixture(page, guardian);
  await expect(page.getByRole("heading", { name: "Family portal" })).toBeVisible();
  await page.goto("/portal/sessions");
  await expect(page.getByText("Linear equations clinic")).toBeVisible();
  await expect(page.getByText("Geometry one-on-one")).toBeVisible();
  await expect(page.getByText("Mira explored linear equations")).toBeVisible();
  await expect(page.getByText("Jules explored linear equations")).toHaveCount(0);
  await expect(page.getByText("Draft recap awaiting approval")).toHaveCount(0);
  const calendar = await page.request.get(`/portal/calendar/${individualSession}`);
  expect(calendar.ok()).toBe(true);
  expect(calendar.headers()["content-type"]).toContain("text/calendar");
  expect(await calendar.text()).toContain("SUMMARY:Geometry review · Geometry one-on-one");
  await page.goto("/portal/tutor/clients");
  await expect(page).toHaveURL(/\/portal\/?$/);
  await page.goto("/portal/billing");
  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  await expect(page.getByText("Open", { exact: true })).toBeVisible();
  await expect(page.locator(`a[href="${invoice.hosted_url}"]`)).toBeVisible();
  await expect(page.locator(`a[href="${otherInvoice.hosted_url}"]`)).toHaveCount(0);
  await expect(page.locator('a[href="https://billing.stripe.com/p/login/ceria-fixture"]')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("guardian-billing-mobile.png"), fullPage: true });
});

test("session preparation becomes a private, reviewed study plan with scoped completion", async ({ page, browser }, testInfo) => {
  const anonymous = await browser.newPage();
  try { expect((await anonymous.request.post("/api/session-preparation", { data: {} })).status()).toBe(401); }
  finally { await anonymous.close(); }
  const { tutorDb, student, peer, guardian, group } = fixture;
  const sessionId = await saveSession(tutorDb, group, "Study plan workflow", [student, peer], new Date().toISOString());
  const material = await insert(tutorDb, "materials", { engagement_id: group.id, session_id: sessionId, title: "Exam review worksheet", body: "Exponent rules and logarithms." });
  remove("materials", "id", material.id);
  const path = `${group.id}/${randomUUID()}/worksheet.txt`;
  await checked(tutorDb.storage.from(storageBucket).upload(path, new Blob(["Question 14c: solve a logarithm equation. Check the domain."], { type: "text/plain" })), "Upload AI worksheet");
  cleanup.push(() => checked(admin.storage.from(storageBucket).remove([path]), "Clean AI worksheet"));
  await checked(tutorDb.rpc("add_material_attachment", { p_material_id: material.id, p_storage_path: path, p_filename: "worksheet.txt", p_size_bytes: 70 }), "Register worksheet");
  const privatePeerMaterial = await insert(tutorDb, "materials", { engagement_id: group.id, session_id: sessionId, student_id: peer.id, title: "Peer secret worksheet", body: "Never send peer information." });
  remove("materials", "id", privatePeerMaterial.id);
  await checked(tutorDb.from("session_notes").insert({ session_id: sessionId, student_id: peer.id, topics: "Never send peer notes." }), "Add peer notes");
  await signInFixture(page, fixture.tutor);
  await page.goto(`/portal/tutor/sessions/${sessionId}/prepare?student=${student.id}`);
  await expect(page.getByLabel(/Peer secret worksheet/)).toHaveCount(0);
  const before = aiFixture.requests.length;
  const generationResponse = page.waitForResponse(response => response.url().endsWith("/api/session-preparation"));
  await page.getByRole("button", { name: "Generate preparation", exact: true }).click();
  const generated = await generationResponse;
  expect(generated.status(), await generated.text()).toBe(200);
  expect((await generated.json()).preparation.summary).toContain("exponent rules");
  await expect(page.getByRole("textbox", { name: "Session outline", exact: true })).toHaveValue(/exponent rules/);
  expect(aiFixture.requests.length).toBe(before + 1);
  const sent = JSON.stringify(aiFixture.requests.at(-1));
  expect(sent).toContain("Question 14c");
  expect(sent).not.toContain("Never send peer");
  expect(sent).not.toContain(student.email);
  expect(aiFixture.requests.at(-1).store).toBe(false);
  await page.getByRole("combobox", { name: "Student confidence", exact: true }).selectOption("low");
  await page.getByRole("combobox", { name: "Observed understanding", exact: true }).selectOption("with-help");
  await page.getByRole("textbox", { name: "Observation notes", exact: true }).fill("Needed a prompt to check the log domain.");
  await page.getByRole("button", { name: "Save preparation", exact: true }).click();
  await expect(page.getByText("Preparation and observations saved.", { exact: true })).toBeVisible();
  const [studentDb, peerDb, guardianDb] = await Promise.all([asPerson(student), asPerson(peer), asPerson(guardian)]);
  for (const client of [studentDb, peerDb, guardianDb]) {
    expect(await checked(client.from("session_preparations").select("session_id").eq("session_id", sessionId), "Preparation privacy")).toEqual([]);
  }
  await page.getByRole("button", { name: "Generate study plan", exact: true }).click();
  await expect(page.getByLabel("Plan title", { exact: true })).toHaveValue("Focused logarithm practice");
  expect(JSON.stringify(aiFixture.requests.at(-1))).toContain("Needed a prompt to check the log domain.");
  await page.getByRole("button", { name: "Save study plan draft", exact: true }).click();
  await expect(page.getByText("Study plan draft saved.", { exact: true })).toBeVisible();
  const saved = await checked(tutorDb.from("study_plans").select("id,study_plan_items(*)").eq("session_id", sessionId).eq("student_id", student.id).single(), "Read study plan draft");
  expect(await tableIds(studentDb, "study_plans", [saved.id])).toEqual([]);
  const taskId = saved.study_plan_items[0].id;
  expect((await studentDb.rpc("complete_study_plan_item", { p_id: taskId, p_completed: true })).error).toBeTruthy();
  await page.getByRole("textbox", { name: "Plan summary", exact: true }).fill("A reviewed plan for domain checks.");
  await expect(page.getByRole("button", { name: "Publish study plan", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save study plan draft", exact: true }).click();
  await page.getByRole("button", { name: "Publish study plan", exact: true }).click();
  await expect(page.getByText("Study plan published to the student and linked guardians.", { exact: true })).toBeVisible();
  expect(await tableIds(studentDb, "study_plans", [saved.id])).toEqual([saved.id]);
  expect(await tableIds(guardianDb, "study_plans", [saved.id])).toEqual([saved.id]);
  expect(await tableIds(peerDb, "study_plans", [saved.id])).toEqual([]);
  expect(await tableIds(peerDb, "study_plan_items", [taskId])).toEqual([]);
  expect((await peerDb.rpc("complete_study_plan_item", { p_id: taskId, p_completed: true })).error).toBeTruthy();
  expect((await guardianDb.rpc("complete_study_plan_item", { p_id: taskId, p_completed: true })).error).toBeTruthy();
  expect(await checked(studentDb.from("study_plan_items").update({ title: "Tampered" }).eq("id", taskId).select("id"), "Student content protection")).toEqual([]);
  const studentPage = await browser.newPage();
  try {
    await signInFixture(studentPage, student);
    await studentPage.goto("/portal/study-plans");
    await studentPage.getByRole("button", { name: "Mark complete", exact: true }).click();
    await expect(studentPage.getByText("1 of 1 tasks completed", { exact: true })).toBeVisible();
    await studentPage.screenshot({ path: testInfo.outputPath("student-study-plan.png"), fullPage: true });
    const forbidden = await studentPage.request.post("/api/session-preparation", { data: { sessionId, studentId: student.id, kind: "plan", materialIds: [] } });
    expect(forbidden.status()).toBe(403);
  } finally { await studentPage.close(); }
  // Published content and completion cannot be changed through the draft RPC.
  expect((await tutorDb.rpc("save_study_plan", { p_session_id: sessionId, p_student_id: student.id, p_title: "Blocked", p_summary: "", p_items: [] })).error).toBeTruthy();
  const duplicatePublish = await tutorDb.rpc("publish_study_plan", { p_id: saved.id });
  expect(duplicatePublish.error).toBeNull();
  const notifications = await checked(tutorDb.from("notifications").select("id").eq("recipient_id", student.id).eq("title", "Study plan ready"), "One publication notification");
  expect(notifications.length).toBe(1);
  await page.screenshot({ path: testInfo.outputPath("tutor-preparation.png"), fullPage: true });
  const guardianPage = await browser.newPage();
  try {
    await signInFixture(guardianPage, guardian);
    await guardianPage.goto("/portal/study-plans");
    await expect(guardianPage.getByRole("heading", { name: "Focused logarithm practice", exact: true })).toBeVisible();
    await expect(guardianPage.getByText("1 of 1 tasks completed", { exact: true })).toBeVisible();
    await expect(guardianPage.getByRole("button", { name: "Mark incomplete", exact: true })).toHaveCount(0);
    await expect(guardianPage.getByText("Needed a prompt to check the log domain.", { exact: true })).toHaveCount(0);
    await guardianPage.screenshot({ path: testInfo.outputPath("guardian-study-plan.png"), fullPage: true });
  } finally { await guardianPage.close(); }
  const crossSite = await page.request.post("/api/session-preparation", { headers: { origin: "https://unrelated.example" }, data: {} });
  expect(crossSite.status()).toBe(403);
  const unauthorizedMaterial = await page.request.post("/api/session-preparation", { headers: { origin: "http://127.0.0.1:3100" }, data: { sessionId, studentId: student.id, kind: "preparation", materialIds: [privatePeerMaterial.id] } });
  expect(unauthorizedMaterial.status()).toBe(400);
  const again = await page.request.post("/api/session-preparation", { headers: { origin: "http://127.0.0.1:3100" }, data: { sessionId, studentId: student.id, kind: "preparation", materialIds: [material.id] } });
  expect((await again.json()).error).toContain("two minutes");
  await checked(tutorDb.from("study_plans").update({ published_at: null }).eq("id", saved.id), "Return plan to draft");
  await checked(tutorDb.rpc("save_study_plan", { p_session_id: sessionId, p_student_id: student.id, p_title: "Revised plan", p_summary: "", p_items: saved.study_plan_items }), "Edit existing task");
  const retained = await checked(tutorDb.from("study_plan_items").select("completed_at").eq("id", taskId).single(), "Read retained completion");
  expect(retained.completed_at).toBeTruthy();
});

test("AI credit failures preserve drafts and HEIC photos upload as JPEG", async ({ page, browser }, testInfo) => {
  const { tutorDb, group, student } = fixture;
  const sessionId = await saveSession(tutorDb, group, "Generation error handling", [student], new Date().toISOString());
  await signInFixture(page, fixture.tutor);
  await page.goto(`/portal/tutor/sessions/${sessionId}/prepare`);
  await page.getByRole("textbox", { name: "Session outline", exact: true }).fill("Keep this preparation when generation fails.");
  aiFixture.mode = "quota";
  try {
    await page.getByRole("button", { name: "Generate study plan", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "credit limit" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Session outline", exact: true })).toHaveValue("Keep this preparation when generation fails.");
  } finally { aiFixture.mode = "success"; }
  const material = await insert(tutorDb, "materials", { engagement_id: group.id, title: "HEIC support", body: "A converted photo." });
  remove("materials", "id", material.id);
  await page.goto(`/portal/tutor/materials/${material.id}`);
  const heicPath = process.env.TEST_HEIC_PATH || fileURLToPath(new URL("./fixtures/sample.heic", import.meta.url));
  await page.getByLabel("Add files", { exact: true }).setInputFiles(heicPath);
  await page.getByRole("button", { name: "Upload files", exact: true }).click();
  await expect(page.getByText("1 file added.", { exact: true })).toBeVisible({ timeout: 30000 });
  const [file] = await checked(tutorDb.from("material_attachments").select("*").eq("material_id", material.id), "Read converted attachment");
  cleanup.push(() => checked(admin.storage.from(storageBucket).remove([file.storage_path]), "Clean converted photo"));
  expect(file.filename).toBe(basename(heicPath).replace(/\.(heic|heif)$/i, ".jpg"));
  const blob = await checked(tutorDb.storage.from(storageBucket).download(file.storage_path), "Read converted JPEG");
  expect(blob.type).toBe("image/jpeg");
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  expect([...jpeg.slice(0, 2)]).toEqual([255, 216]);
  await writeFile(testInfo.outputPath("heic-converted.jpg"), jpeg);
  await page.getByRole("button", { name: "Publish material", exact: true }).click();
  await expect(page.getByText("Material published.", { exact: true })).toBeVisible();
  const viewer = await browser.newPage();
  try {
    await signInFixture(viewer, fixture.student);
    await viewer.goto(`/portal/materials/${material.id}`);
    const image = viewer.getByRole("img", { name: file.filename, exact: true });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(element => element.naturalWidth)).toBeGreaterThan(0);
    await viewer.screenshot({ path: testInfo.outputPath("document-viewer.png"), fullPage: true });
  } finally { await viewer.close(); }
  await page.screenshot({ path: testInfo.outputPath("heic-upload.png"), fullPage: true });
});

test("email-free dashboard links work and deleting a client revokes existing sessions and unused links", async ({ page, context, browser }, testInfo) => {
  const tutor = fixture.tutorDb;
  expect((await tutor.rpc("delete_client", { p_id: fixture.tutor.id })).error).toBeTruthy();
  const child = await insert(tutor, "people", { name: "Dashboard-only student", email: null, role: "student" });
  remove("people", "id", child.id);
  const engagement = await insert(tutor, "engagements", { title: "Dashboard link course", kind: "one-off" });
  remove("engagements", "id", engagement.id);
  await checked(tutor.from("engagement_students").insert({ engagement_id: engagement.id, student_id: child.id }), "Enroll email-free student");
  const sessionId = await saveSession(tutor, engagement, "Exam review", [child], new Date().toISOString());
  const invoice = await insert(tutor, "invoices", { student_id: child.id, title: "Dashboard history invoice", amount_cents: 2500, currency: "usd", status: "open", hosted_url: "https://invoice.stripe.com/i/deleted-client-fixture" });
  remove("invoices", "id", invoice.id);
  await checked(tutor.from("guardians").insert({ guardian_id: fixture.guardian.id, student_id: child.id }), "Link email-free student");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signInFixture(page, fixture.tutor);
  await page.goto(`/portal/tutor/clients/${child.id}`);
  async function copy() {
    await page.getByRole("button", { name: "Copy dashboard link", exact: true }).click();
    await expect(page.getByText("Sign-in link copied.", { exact: false })).toBeVisible();
    const link = new URL(await page.evaluate(() => navigator.clipboard.readText()));
    return `${link.pathname}${link.search}`;
  }
  const firstLink = await copy();
  const identity = await checked(admin.from("people").select("auth_user_id,email").eq("id", child.id).single(), "Read generated dashboard identity");
  expect(identity.email).toBeNull();
  cleanup.push(async () => { await admin.auth.admin.deleteUser(identity.auth_user_id); });
  const studentPage = await browser.newPage();
  const replayPage = await browser.newPage();
  try {
    await continueToPortal(studentPage, firstLink);
    await expect(studentPage.getByRole("heading", { name: "Your learning desk" })).toBeVisible();
    await studentPage.goto("/portal/sessions");
    await expect(studentPage.getByRole("heading", { name: "Dashboard link course", exact: true })).toBeVisible();
    await expect(studentPage.getByText("Exam review", { exact: true })).toBeVisible();
    await replayPage.goto(firstLink);
    await replayPage.getByRole("button", { name: "Continue to portal" }).click();
    await expect(replayPage).toHaveURL(/state=expired/);
    const apiLink = new URL(await copy(), "http://127.0.0.1:3100");
    const studentDb = createClient(apiUrl, publicKey, clientOptions);
    await checked(studentDb.auth.verifyOtp({ type: apiLink.searchParams.get("type"), token_hash: apiLink.searchParams.get("token_hash") }), "Sign in email-free Data API client");
    expect(await tableIds(studentDb, "sessions", [sessionId])).toEqual([sessionId]);
    expect((await studentDb.rpc("delete_client", { p_id: fixture.tutor.id })).error).toBeTruthy();
    const unusedLink = await copy();
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "Delete client", exact: true }).click();
    await expect(page.getByRole("heading", { name: child.name, exact: true })).toBeVisible();
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Delete client", exact: true }).click();
    await expect(page).toHaveURL(/\/portal\/tutor\/clients$/);
    await expect(page.getByRole("link", { name: child.name, exact: true })).toHaveCount(0);
    const removed = await checked(admin.from("people").select("deleted_at,auth_user_id,email,revoked_auth_user_id").eq("id", child.id).single(), "Read revoked profile");
    expect(removed).toMatchObject({ auth_user_id: null, email: null, revoked_auth_user_id: identity.auth_user_id });
    expect(removed.deleted_at).toBeTruthy();
    expect(await tableIds(studentDb, "sessions", [sessionId])).toEqual([]);
    expect(await tableIds(studentDb, "people", [child.id])).toEqual([]);
    expect((await studentDb.rpc("attach_person")).data).toBeNull();
    await studentPage.reload();
    await expect(studentPage).toHaveURL(/\/login(?:\?|$)/);
    await replayPage.goto(unusedLink);
    await replayPage.getByRole("button", { name: "Continue to portal" }).click();
    await expect(replayPage).toHaveURL(/state=(expired|unassigned)/);
    expect(await tableIds(tutor, "sessions", [sessionId])).toEqual([sessionId]);
    const guardianDb = await asPerson(fixture.guardian);
    const linked = await checked(guardianDb.rpc("linked_students"), "Read remaining guardian links");
    expect(linked.some(person => person.id === child.id)).toBe(false);
    expect(linked.some(person => person.id === fixture.student.id)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("client-deleted.png"), fullPage: true });
    await page.goto("/portal/tutor/billing");
    const history = page.locator("details").filter({ hasText: "Dashboard history invoice" });
    await history.locator("summary").click();
    await expect(history.getByText(child.name, { exact: false })).toBeVisible();
    await expect(page.getByRole("option", { name: child.name, exact: true })).toHaveCount(0);
  } finally { await studentPage.close(); await replayPage.close(); }
});

test("engagements show student names and sessions use an optional focus", async ({ page, browser }, testInfo) => {
  await signInFixture(page, fixture.tutor);
  await page.goto("/portal/tutor/engagements");
  const row = page.locator("li").filter({ has: page.locator(`a[href="/portal/tutor/engagements/${fixture.group.id}"]`) });
  await expect(row).toContainText(fixture.student.name);
  await expect(row).toContainText(fixture.peer.name);
  await page.screenshot({ path: testInfo.outputPath("engagement-students.png"), fullPage: true });
  await page.goto(`/portal/tutor/sessions?engagement=${fixture.group.id}`);
  await expect(page.getByLabel("Focus (optional)", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
  await page.getByLabel("Start date and time", { exact: true }).fill("2027-01-15T17:00");
  await page.getByRole("button", { name: "Schedule session", exact: true }).click();
  await expect(page).toHaveURL(/\/portal\/tutor\/sessions\/[0-9a-f-]+$/);
  const id = new URL(page.url()).pathname.split("/").at(-1);
  remove("sessions", "id", id);
  const saved = await checked(fixture.tutorDb.from("sessions").select("title").eq("id", id).single(), "Read empty focus");
  expect(saved.title).toBe("");
  const studentPage = await browser.newPage();
  try {
    await signInFixture(studentPage, fixture.student);
    await studentPage.goto("/portal/sessions");
    const card = studentPage.locator("article").filter({ hasText: "Jan 15, 2027" });
    await expect(card.getByRole("heading", { name: fixture.group.title, exact: true })).toBeVisible();
    await expect(card).not.toContainText(fixture.peer.name);
    await studentPage.screenshot({ path: testInfo.outputPath("session-engagement-focus-date.png"), fullPage: true });
  } finally { await studentPage.close(); }
});

test("deleting an engagement removes its lesson content while keeping clients and reusable quizzes", async ({ page }) => {
  const tutor = fixture.tutorDb;
  const engagement = await insert(tutor, "engagements", { title: "Delete this engagement", kind: "short-term" });
  remove("engagements", "id", engagement.id);
  await checked(tutor.from("engagement_students").insert({ engagement_id: engagement.id, student_id: fixture.student.id }), "Enroll deletion fixture");
  const sessionId = await saveSession(tutor, engagement, "Final review", [fixture.student], new Date().toISOString());
  await checked(tutor.from("session_notes").insert({ session_id: sessionId, student_id: fixture.student.id, topics: "Private notes" }), "Create deletion notes");
  const recap = await insert(tutor, "recaps", { session_id: sessionId, student_id: fixture.student.id, audience: "student", body: "Recap" });
  const material = await insert(tutor, "materials", { engagement_id: engagement.id, session_id: sessionId, title: "Delete this file" });
  remove("materials", "id", material.id);
  const path = `${engagement.id}/${randomUUID()}/delete.txt`;
  await checked(tutor.storage.from(storageBucket).upload(path, new Blob(["Delete me"], { type: "text/plain" })), "Upload deletion file");
  cleanup.push(async () => { await admin.storage.from(storageBucket).remove([path]); });
  const fileId = await checked(tutor.rpc("add_material_attachment", { p_material_id: material.id, p_storage_path: path, p_filename: "delete.txt", p_size_bytes: 9 }), "Register deletion file");
  const quiz = await insert(tutor, "quizzes", { title: "Keep reusable quiz", questions: [{ kind: "numeric", prompt: "What is 1 + 1?", choices: [], answer: "2", explanation: "One plus one is two.", tolerance: 0, topic: "Addition" }] });
  remove("quizzes", "id", quiz.id);
  const assignmentId = await checked(tutor.rpc("publish_quiz_assignment", { p_quiz_id: quiz.id, p_engagement_id: engagement.id, p_student_ids: [fixture.student.id], p_due_at: null }), "Assign deletion quiz");
  remove("assignments", "id", assignmentId);
  const studentDb = await asPerson(fixture.student);
  const submissionId = await checked(studentDb.rpc("submit_quiz", { p_assignment_id: assignmentId, p_answers: ["2"] }), "Submit deletion quiz");
  remove("submissions", "id", submissionId);
  const planId = await checked(tutor.rpc("save_study_plan", { p_session_id: sessionId, p_student_id: fixture.student.id, p_title: "Remove this plan", p_summary: "", p_items: [{ id: randomUUID(), title: "A study task", details: "", source: "", estimated_minutes: null, due_date: null }] }), "Create deletion plan");
  expect((await studentDb.rpc("delete_engagement", { p_id: engagement.id })).error).toBeTruthy();
  await signInFixture(page, fixture.tutor);
  await page.goto(`/portal/tutor/engagements/${engagement.id}`);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Delete engagement", exact: true }).click();
  await expect(page).toHaveURL(/\/portal\/tutor\/engagements$/);
  for (const [table, id] of [["engagements",engagement.id],["sessions",sessionId],["materials",material.id],["recaps",recap.id],["assignments",assignmentId],["submissions",submissionId],["study_plans",planId],["material_attachments",fileId]]) {
    expect(await tableIds(admin, table, [id])).toEqual([]);
  }
  expect((await admin.storage.from(storageBucket).download(path)).error).toBeTruthy();
  expect(await tableIds(tutor, "people", [fixture.student.id])).toEqual([fixture.student.id]);
  expect(await tableIds(tutor, "quizzes", [quiz.id])).toEqual([quiz.id]);
});

test("a linked client's email can be changed or cleared while preserving their account and work", async ({ page, context, browser }) => {
  const student = await createPerson("student", "Editable email student");
  const originalEmail = student.email;
  const engagement = await insert(fixture.tutorDb, "engagements", { title: "Email editing course", kind: "one-off" });
  remove("engagements", "id", engagement.id);
  await checked(fixture.tutorDb.from("engagement_students").insert({ engagement_id: engagement.id, student_id: student.id }), "Enroll email edit fixture");
  const sessionId = await saveSession(fixture.tutorDb, engagement, "Preserve this lesson", [student], new Date().toISOString());
  await signInFixture(page, fixture.tutor);
  const profilePath = `/portal/tutor/clients/${student.id}`;
  await page.goto(`${profilePath}?edit=1`);
  await expect(page.getByLabel("Email (optional)", { exact: true })).toBeEditable();
  const email = syntheticEmail("changed");
  await page.getByLabel("Email (optional)", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === profilePath && !url.search);
  const account = await checked(admin.auth.admin.getUserById(student.auth_user_id), "Read updated Auth identity");
  expect(account.user.email).toBe(email);
  expect((await checked(admin.from("people").select("email,auth_user_id").eq("id", student.id).single(), "Read changed contact"))).toMatchObject({ email, auth_user_id: student.auth_user_id });

  await page.goto(`${profilePath}?edit=1`);
  await page.getByLabel("Email (optional)", { exact: true }).fill(fixture.peer.email);
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already uses this email" })).toBeVisible();
  expect((await checked(admin.auth.admin.getUserById(student.auth_user_id), "Check duplicate email leaves identity intact")).user.email).toBe(email);
  await page.getByLabel("Email (optional)", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === profilePath && !url.search);
  const cleared = await checked(admin.from("people").select("email,auth_user_id").eq("id", student.id).single(), "Read cleared contact");
  expect(cleared).toMatchObject({ email: null, auth_user_id: student.auth_user_id });
  expect((await checked(admin.auth.admin.getUserById(student.auth_user_id), "Read email-free Auth identity")).user.email).toBe(`${student.id}@portal.ceria.invalid`);
  expect((await admin.auth.admin.listUsers()).data.users.some(user => user.email === originalEmail)).toBe(false);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy dashboard link", exact: true }).click();
  await expect(page.getByText("Sign-in link copied.", { exact: false })).toBeVisible();
  const link = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  const studentPage = await browser.newPage();
  try {
    await continueToPortal(studentPage, link.pathname + link.search);
    await studentPage.goto("/portal/sessions");
    await expect(studentPage.getByRole("heading", { name: engagement.title, exact: true })).toBeVisible();
    await expect(studentPage.getByText("Preserve this lesson", { exact: true })).toBeVisible();
  } finally { await studentPage.close(); }
  expect(await tableIds(fixture.tutorDb, "sessions", [sessionId])).toEqual([sessionId]);
});

test("materials preview Markdown and equations, link to sessions, save private student work, and delete cleanly", async ({ page, browser }, testInfo) => {
  const { tutorDb, student, peer, outsider, guardian, group } = fixture;
  const title = `Interactive Markdown worksheet ${randomUUID().slice(0, 6)}`;
  const source = '# Review notes\n\nA **careful explanation** with *emphasis*, ~~old advice~~, and $x^2 + 1$.\n\n$$\n\\frac{1}{2} + \\frac{1}{2} = 1\n$$\n\n| Topic | Practice |\n| --- | --- |\n| Algebra | Factor |\n\n- First step\n- [x] Worked example\n\n> Check your reasoning.\n\n```js\nconst total = 2;\n```\n\n[Reference](https://example.com/reference)\n\nA footnote.[^note]\n\n[^note]: Review the signs.\n\n<script>window.materialInjected = true</script>\n\n[unsafe](javascript:alert(1))';
  await signInFixture(page, fixture.tutor);
  await page.goto(`/portal/tutor/materials?engagement=${group.id}`);
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Material text (optional)", { exact: true }).fill(source);
  await page.getByLabel("Interactive material", { exact: true }).check();
  await page.getByRole("button", { name: "Create material draft", exact: true }).click();
  await expect(page).toHaveURL(/\/portal\/tutor\/materials\/[0-9a-f-]+$/);
  const materialId = new URL(page.url()).pathname.split("/").at(-1);
  remove("materials", "id", materialId);
  await page.getByLabel("Add files", { exact: true }).setInputFiles({ name: "worksheet.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") });
  await page.getByRole("button", { name: "Upload files", exact: true }).click();
  await expect(page.getByText("1 file added.", { exact: true })).toBeVisible();
  const file = await checked(tutorDb.from("material_attachments").select("id,storage_path").eq("material_id", materialId).single(), "Read worksheet file");
  cleanup.push(async () => { await admin.storage.from(storageBucket).remove([file.storage_path]); });
  await page.goto("/portal/tutor/materials");
  const preview = page.getByRole("link", { name: title, exact: true });
  await expect(preview).toHaveAttribute("target", "_blank");
  const popupPromise = page.waitForEvent("popup");
  await preview.click();
  const documentPage = await popupPromise;
  try {
    await expect(documentPage.getByRole("heading", { name: "Review notes", exact: true })).toBeVisible();
    await expect(documentPage.locator("strong", { hasText: "careful explanation" })).toBeVisible();
    await expect(documentPage.getByRole("table")).toBeVisible();
    await expect(documentPage.locator(".katex-display")).toHaveCount(1);
    await expect(documentPage.locator("pre code")).toContainText("const total = 2;");
    await expect(documentPage.locator(".footnotes")).toContainText("Review the signs.");
    await expect(documentPage.locator('a[href^="javascript:"]')).toHaveCount(0);
    expect(await documentPage.evaluate(() => window.materialInjected)).toBeUndefined();
    await expect.poll(() => documentPage.getByRole("img", { name: "worksheet.png", exact: true }).evaluate(image => image.naturalWidth)).toBe(1);
    await documentPage.screenshot({ path: testInfo.outputPath("tutor-document-preview.png"), fullPage: true });
  } finally { await documentPage.close(); }
  await page.goto(`/portal/tutor/materials/${materialId}`);
  await page.getByRole("button", { name: "Publish material", exact: true }).click();
  await expect(page.getByText("Material published.", { exact: true })).toBeVisible();
  await page.getByLabel("Material text (optional)", { exact: true }).fill(source + '\n\n## Added after publishing\n\nUse $a^2+b^2=c^2$.');
  await page.getByRole("button", { name: "Save material", exact: true }).click();
  await expect(page.getByText("Material saved.", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Session", exact: true }).selectOption(fixture.groupSession);
  await page.getByRole("button", { name: "Link to session", exact: true }).click();
  await expect(page.getByText("Material linked to session.", { exact: true })).toBeVisible();
  const secondSession = await saveSession(tutorDb, group, "Independent practice", [student], new Date().toISOString());
  await page.goto(`/portal/tutor/sessions/${secondSession}`);
  await page.getByLabel("Existing material", { exact: true }).selectOption(materialId);
  await page.getByRole("button", { name: "Link material", exact: true }).click();
  await expect(page.getByRole("link", { name: title, exact: true })).toHaveAttribute("target", "_blank");
  const [studentDb, peerDb, outsiderDb, guardianDb] = await Promise.all([asPerson(student), asPerson(peer), asPerson(outsider), asPerson(guardian)]);
  for (const denied of [outsiderDb, guardianDb]) expect((await denied.rpc("save_material_response", { p_material_id: materialId, p_body: "forbidden" })).error).toBeTruthy();
  expect((await studentDb.rpc("delete_material", { p_id: materialId })).error).toBeTruthy();
  expect((await studentDb.from("material_sessions").insert({ material_id: materialId, session_id: fixture.individualSession, engagement_id: group.id })).error).toBeTruthy();
  expect((await tutorDb.from("material_sessions").insert({ material_id: materialId, session_id: fixture.individualSession, engagement_id: group.id })).error).toBeTruthy();
  const studentPage = await browser.newPage();
  try {
    await signInFixture(studentPage, student);
    await studentPage.goto("/portal/sessions");
    await expect(studentPage.getByRole("link", { name: title, exact: true })).toHaveCount(2);
    await studentPage.goto(`/portal/materials/${materialId}`);
    await expect(studentPage.getByRole("heading", { name: "Added after publishing", exact: true })).toBeVisible();
    await studentPage.getByLabel("Answers and working", { exact: true }).fill('## My reasoning\n\nI used **factoring**: $x^2-1=(x-1)(x+1)$.');
    await studentPage.getByRole("button", { name: "Save work", exact: true }).click();
    await expect(studentPage.getByText("Your work is saved.", { exact: true })).toBeVisible();
    await studentPage.reload();
    await expect(studentPage.getByLabel("Answers and working", { exact: true })).toHaveValue(/I used \*\*factoring\*\*/);
    await studentPage.getByText("Preview formatting", { exact: true }).click();
    await expect(studentPage.getByRole("heading", { name: "My reasoning", exact: true })).toBeVisible();
    await studentPage.locator("section").filter({ has: studentPage.getByRole("heading", { name: "Your work", exact: true }) })
      .screenshot({ path: testInfo.outputPath("student-material-workspace.png") });
  } finally { await studentPage.close(); }
  const peerWork = "A different student's private answer";
  await checked(peerDb.rpc("save_material_response", { p_material_id: materialId, p_body: peerWork }), "Save separate peer work");
  const personalRows = await checked(studentDb.from("material_responses").select("student_id,body").eq("material_id", materialId), "Read only own work");
  expect(personalRows).toHaveLength(1);
  expect(personalRows[0].student_id).toBe(student.id);
  expect(JSON.stringify(personalRows)).not.toContain(peerWork);
  for (const denied of [outsiderDb, guardianDb]) expect(await checked(denied.from("material_responses").select("*").eq("material_id", materialId), "Check workspace privacy")).toEqual([]);
  expect((await studentDb.from("material_responses").update({ student_id: peer.id }).eq("material_id", materialId)).error).toBeTruthy();
  await checked(tutorDb.from("materials").update({ interactive: false }).eq("id", materialId), "Disable material workspace");
  expect((await studentDb.rpc("save_material_response", { p_material_id: materialId, p_body: "should not overwrite" })).error).toBeTruthy();
  await checked(tutorDb.from("materials").update({ interactive: true }).eq("id", materialId), "Restore interactive material");
  await checked(tutorDb.from("materials").update({ published_at: null }).eq("id", materialId), "Pause material");
  expect((await studentDb.rpc("save_material_response", { p_material_id: materialId, p_body: "should not overwrite" })).error).toBeTruthy();
  await checked(tutorDb.rpc("publish_material", { p_id: materialId }), "Restore material publication");
  await page.goto(`/portal/materials/${materialId}`);
  await expect(page.getByRole("heading", { name: "My reasoning", exact: true })).toBeVisible();
  await expect(page.getByText(peerWork, { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("tutor-student-work-review.png"), fullPage: true });
  await page.goto(`/portal/tutor/materials/${materialId}`);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Delete material", exact: true }).click();
  await expect(page).toHaveURL(/\/portal\/tutor\/materials$/);
  expect(await tableIds(admin, "materials", [materialId])).toEqual([]);
  for (const table of ["material_responses", "material_sessions", "material_attachments"]) expect(await checked(admin.from(table).select("*").eq("material_id", materialId), `Check removed ${table}`)).toEqual([]);
  expect((await admin.storage.from(storageBucket).download(file.storage_path)).error).toBeTruthy();
});

test("session material links preserve individual sharing and hide other students' work", async () => {
  const { tutorDb, student, peer, outsider, guardian } = fixture;
  const engagement = await insert(tutorDb, "engagements", { title: "Scoped material sessions", kind: "ongoing" });
  remove("engagements", "id", engagement.id);
  await checked(tutorDb.from("engagement_students").insert([student, peer].map(person => ({ engagement_id: engagement.id, student_id: person.id }))), "Enroll scoped material students");
  const firstSession = await saveSession(tutorDb, engagement, "First student only", [student], new Date().toISOString());
  const secondSession = await saveSession(tutorDb, engagement, "Second student only", [peer], new Date().toISOString());
  const material = await insert(tutorDb, "materials", { engagement_id: engagement.id, session_id: firstSession, title: "Session-scoped worksheet", body: "Show your reasoning.", interactive: true });
  remove("materials", "id", material.id);
  await checked(tutorDb.rpc("publish_material", { p_id: material.id }), "Publish scoped material");
  const [studentDb, peerDb, outsiderDb, guardianDb] = await Promise.all([asPerson(student), asPerson(peer), asPerson(outsider), asPerson(guardian)]);
  expect(await tableIds(peerDb, "materials", [material.id])).toEqual([]);
  await checked(tutorDb.from("material_sessions").insert({ material_id: material.id, session_id: secondSession, engagement_id: engagement.id }), "Link material to second student's session");
  expect(await tableIds(peerDb, "materials", [material.id])).toEqual([material.id]);
  for (const denied of [outsiderDb, guardianDb]) expect(await tableIds(denied, "materials", [material.id])).toEqual([]);
  expect(await checked(studentDb.from("material_sessions").select("session_id").eq("material_id", material.id), "Hide another student's session link")).toEqual([]);
  await checked(peerDb.rpc("save_material_response", { p_material_id: material.id, p_body: "Second student's work" }), "Save linked-session work");
  await checked(tutorDb.from("material_sessions").delete().eq("material_id", material.id).eq("session_id", secondSession), "Remove linked session");
  expect(await tableIds(peerDb, "materials", [material.id])).toEqual([]);
  expect(await checked(peerDb.from("material_responses").select("*").eq("material_id", material.id), "Hide work after session unlink")).toEqual([]);
  expect((await peerDb.rpc("save_material_response", { p_material_id: material.id, p_body: "Not permitted" })).error).toBeTruthy();
  await checked(tutorDb.from("material_sessions").insert({ material_id: material.id, session_id: secondSession, engagement_id: engagement.id }), "Restore linked session");
  await checked(tutorDb.from("materials").update({ student_id: student.id }).eq("id", material.id), "Restrict material to one student");
  expect(await tableIds(peerDb, "materials", [material.id])).toEqual([]);
  expect(await tableIds(studentDb, "materials", [material.id])).toEqual([material.id]);
  const kept = await checked(tutorDb.from("material_responses").select("body").eq("material_id", material.id).single(), "Keep tutor access to prior work");
  expect(kept.body).toBe("Second student's work");
});

test("quiz Markdown and equations render in the editor, student player, and answer review", async ({ page, browser }, testInfo) => {
  const draft = { title: "Formatted quiz", description: "## Before you start\n\nUse **exact values** and $x^2$.", questions: [{ kind: "multiple-choice", prompt: "Find the **positive** value.\n\n$$\nx^2=4\n$$", topic: "Algebra", choices: ["**Two**: $2$", "*Three*: $3$"], answer: "**Two**: $2$", explanation: "### Reasoning\n\n- Take the positive root.\n\n$$\n\\sqrt{4}=2\n$$\n\n| Step | Result |\n| --- | --- |\n| Root | 2 |", tolerance: 0 }] };
  await signInFixture(page, fixture.tutor);
  await page.goto("/portal/tutor/quizzes/new");
  await page.getByText("Import quiz JSON", { exact: true }).click();
  await page.getByLabel("Paste quiz JSON").fill(JSON.stringify(draft));
  await page.getByRole("button", { name: "Load draft", exact: true }).click();
  await page.getByText("Preview formatted quiz", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Before you start", exact: true })).toBeVisible();
  await expect(page.locator(".katex-display")).toHaveCount(2);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/portal\/tutor\/quizzes\/[0-9a-f-]+$/);
  const quizId = new URL(page.url()).pathname.split("/").at(-1);
  remove("quizzes", "id", quizId);
  const assignmentId = await checked(fixture.tutorDb.rpc("publish_quiz_assignment", { p_quiz_id: quizId, p_engagement_id: fixture.group.id, p_student_ids: [fixture.student.id], p_due_at: null }), "Publish formatted quiz");
  remove("assignments", "id", assignmentId);
  remove("submissions", "assignment_id", assignmentId);
  const studentPage = await browser.newPage();
  try {
    await signInFixture(studentPage, fixture.student);
    await studentPage.goto(`/portal/assignments/${assignmentId}`);
    await expect(studentPage.getByRole("heading", { name: "Before you start", exact: true })).toBeVisible();
    await expect(studentPage.locator("#question-prompt strong")).toHaveText("positive");
    await expect(studentPage.locator("#question-prompt .katex-display")).toHaveCount(1);
    await studentPage.getByRole("radio").first().check();
    await studentPage.getByRole("button", { name: "Submit quiz", exact: true }).click();
    await expect(studentPage.getByRole("heading", { name: "Review your answers", exact: true })).toBeVisible();
    await expect(studentPage.getByRole("heading", { name: "Reasoning", exact: true })).toBeVisible();
    await expect(studentPage.getByRole("table")).toBeVisible();
    await expect(studentPage.getByText("1 of 1 correct", { exact: true })).toBeVisible();
    await studentPage.screenshot({ path: testInfo.outputPath("quiz-markdown-review.png"), fullPage: true });
  } finally { await studentPage.close(); }
});
