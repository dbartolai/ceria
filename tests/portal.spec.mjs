import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const mailpitUrl = process.env.TEST_MAILPIT_URL ?? "http://127.0.0.1:55324";
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const adminKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const storageBucket = "materials";

const fixture = {};
const cleanup = [];
let admin;

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
  await expect(page).toHaveURL((url) => url.pathname === expectedPath && !url.search);
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
  if (!["127.0.0.1", "localhost"].includes(new URL(mailpitUrl).hostname)) {
    throw new Error("Set TEST_MAILPIT_URL to the local mail inbox before running end-to-end tests.");
  }
  if (!publicKey || !adminKey) throw new Error("Add the local Supabase publishable and secret keys to .env.local.");
  admin = createClient(apiUrl, adminKey, clientOptions);

  fixture.tutor = await checked(admin.from("people").select().eq("role", "tutor").limit(1).maybeSingle(), "Find existing local tutor")
    ?? await createPerson("tutor", "Ceria Test Tutor");
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
  await page.getByLabel("Email", { exact: true }).fill(inviteeEmail);
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
    await tutorPage.getByText("Generate a prompt or import a quiz").click();
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
  expect(await tableIds(peerDb, "assignments", [assignmentId])).toEqual([]);
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
  expect(await tableIds(guardianDb, "engagements", [group.id, individual.id])).toEqual([]);
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
  expect(await calendar.text()).toContain("SUMMARY:Geometry one-on-one");
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
