# ceria

ceria is a private tutoring portal for one tutor, their students, and their students’ guardians. See [SPEC.md](SPEC.md) for the product scope and [DESIGN.md](DESIGN.md) for the interface.

## Run locally

Use Node.js 24, npm, and a running Docker engine.

```sh
npm ci
npx supabase@3.1.0 start
npx supabase@3.1.0 status -o env
cp .env.example .env.local
npm run dev -- --hostname 127.0.0.1 --port 3100
```

Fill in `.env.local` before starting Next.js. Use the local API URL (port 55321), the publishable key or local `ANON_KEY`, and the secret key or local `SERVICE_ROLE_KEY`. Keep the secret key server-side. `CERIA_TIME_ZONE` controls displayed session times and defaults to `America/Chicago`. The session editor accepts the tutor’s device time zone and stores absolute timestamps.

Open the [local portal](http://127.0.0.1:3100/portal). Supabase Studio runs on port 55323 and Mailpit on port 55324.

### Create the tutor account

1. In the Supabase SQL Editor, insert the tutor’s profile. Replace the email and name with the intended tutor’s details.

   ```sql
   insert into public.people (email, name, role)
   values (lower('your-tutor@example.com'), 'Tutor name', 'tutor');
   ```

2. In Supabase Studio, open **Authentication → Users** and invite that email. Open the invitation from Mailpit locally or from the tutor’s inbox on a hosted project. Confirm the link to bind the verified Auth account to the tutor profile.
3. In ceria, use **Clients** to create students and guardians and link families. Client email is optional, including for portal access. Each portal account has one role, and contact email addresses must be unique. You can change or clear an email in **Edit profile** without replacing the client’s account or saved work. Clearing an email switches its Auth login to a non-deliverable internal identifier. Use **Copy dashboard link** for a client without email or **Copy sign-in link** for a client with email, then share the one-time link directly. Email invitations remain available for clients with an address. Users can bookmark `/portal` and request a fresh link whenever their session expires.

## Tutor workflow

- Give an engagement a subject or program name, enroll its students, then schedule a session with the relevant participants. Tutor lists show student names separately. Sessions use the engagement, optional focus, and date instead of a required title. Sessions may be entered individually for recurring engagements. Download an ICS invitation to add it to a calendar or send it through a calendar app.
- Open **Prepare session & study plan** on a session. Select a student and materials, then generate or write a preparation. Record the student’s confidence separately from observed understanding. Draft a study plan, review its tasks and dates, save it, then publish. Students can mark tasks complete; linked guardians can view the plan. Preparation and observations remain tutor-only.
- On the session page, record private lesson notes. Draft separate student summaries and guardian recaps, including individual versions when needed. Published recaps, materials, and assignments send in-app notifications. Linked guardians receive notifications for published guardian recaps.
- Use **Quizzes** to write questions, reuse questions from saved drafts, or import quiz JSON. Review the draft and publish to selected students or the whole engagement. Draft changes leave published assignments and prior results intact.
- Use **Materials** to share text, worked examples, and private files. Tutor and student libraries use the same document links, opening in a new tab with images, PDFs, and plain-text previews. Use **Edit material** to change content, sharing, or files, and **Delete material** to remove the document, files, session links, and student work. Saved changes to published materials appear immediately; a published material must keep text or a file. File requests check current portal access and return private, uncached content. Each file can be up to 4 MB. HEIC/HEIF photos up to 20 MB are converted to JPEG in the browser before upload; larger converted images are resized to fit. The original photo stays on your device.
- Link existing materials from a session’s **Session materials** section or a material editor’s **Session links** section. A material can link to several sessions in the same engagement. Published links are visible to those sessions’ participants; an individual material remains restricted to its intended student. Unlinking an additional session removes that session’s access unless the student also has access through the engagement or the material’s related session.
- Enable **Interactive material** to give each student a saved answer workspace below the source document. Students use **Save work** to persist their Markdown answers, then can return and edit them. The tutor reviews saved responses in the document preview. Peers and guardians cannot read these responses. Returning a material to draft, disabling interaction, or removing a student’s access blocks further student work while retaining responses for the tutor.
- Quizzes and materials are available to all engagements. Use the parts needed for each lesson. Existing recorded goals and milestones remain in student progress alongside completed work, reviewed scores, and published topics.

### Removing clients and engagements

Use **Delete client** on a client profile to remove it from the directory and immediately revoke its portal identity, including existing browser sessions and Data API access. Lesson and billing history is retained. Contact email and the active Auth binding are cleared, the old Auth identity is marked revoked, guardian links are removed, and the server deletes the Auth account. If external Auth cleanup fails, database policies still deny the revoked identity access or reattachment.

Use **Delete engagement** on an engagement to permanently remove its sessions, recaps, notes, materials, assigned quizzes and submissions, preparations, and study plans. Client accounts, billing records, and reusable quiz drafts are retained. Both actions require tutor access and a confirmation in the app.

For email-free clients, the server uses a reserved, non-deliverable `.invalid` Auth identifier and binds the generated Auth user directly to the profile. No message is sent to that identifier. An email can be added later without changing the student’s portal identity.

### Stripe billing

Create invoices or payment links in the Stripe Dashboard, then enter their URLs and status in ceria’s **Billing** screen. Update ceria’s invoice status when the Stripe record changes. The guardian’s payment-method link should be the persistent Stripe Customer Portal login link, which authenticates the customer by email. Use a Stripe sandbox to test the hosted pages before adding live links. [Hosted invoices](https://docs.stripe.com/invoicing/hosted-invoice-page) · [Payment Links](https://docs.stripe.com/payment-links) · [Customer Portal login](https://docs.stripe.com/customer-management/activate-no-code-customer-portal)

## AI session preparation

Set `OPENAI_API_KEY` in your ignored `.env.local` for development and as a Vercel Production Secret for the hosted app. `OPENAI_MODEL` defaults to `gpt-6.1-sol`; use a Responses API model supporting image inputs and structured outputs. API billing uses the key's OpenAI project, including any eligible claimed credits. No auto-recharge or billing settings are configured by the app.

Generation is tutor-only. It sends the selected student's shared/individual session notes and selected materials to OpenAI with `store: false`. Other participants' individual materials and notes are excluded. Review source files for personal information before generating. A request supports up to 12 files and 25 MB total. Each generation type has a two-minute per-session cooldown to prevent repeated billed requests. Generation errors preserve saved work; manual preparation and plans work without an API key.

Draft plans are private. Publishing shares a plan with its student and linked guardians and creates in-app notifications. Students can update completion only. To revise a published plan, return it to draft; existing task IDs retain their completion state. Removing a task removes its completion record.

## Markdown and equations

Material text, student answer workspaces, and quiz instructions, prompts, choices, answers, explanations, and feedback render Markdown. Supported formatting includes headings, emphasis, lists, task lists, tables, blockquotes, code blocks, links, images, and footnotes. Materials and quiz editors include formatting previews. Use `$x^2$` for inline equations and `$$` on separate lines around display equations. Numeric answer keys still require decimal or scientific notation for automatic grading; put formatted equations in the prompt or explanation. KaTeX renders the notation. Raw HTML is omitted and unsafe link protocols are blocked. All math plugins use the project’s pinned KaTeX version through an npm override.

## Hosted Supabase and Vercel

1. Run `npx supabase@3.1.0 link --project-ref YOUR_PROJECT_REF` for the intended project, then `npx supabase@3.1.0 db push --remote` to apply all pending migrations. In the Data API settings, expose `public` and keep `private` unexposed. The migrations create the grants, RLS policies, quiz functions, and private attachment bucket.
2. In Supabase Auth, disable public sign-ups and anonymous sign-ins, keep the email provider enabled, and set **Site URL** to the exact HTTPS origin of the ceria app. Configure custom SMTP for client invites and sign-in emails. Copy [the invitation template](supabase/templates/invite.html) and [the magic-link template](supabase/templates/magic_link.html) into the matching Auth templates. Preserve the token hash, type, and confirmation path. New free-tier projects need custom SMTP to edit these templates. [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates) · [Custom SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp) · [Free-tier template rules](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)
3. In Vercel, select the Next.js preset and Node.js 24. Set the variables from [the example](.env.example) in the appropriate Vercel environment. Give each environment its own Supabase project and matching Auth Site URL when testing with a stable preview domain. [Vercel Git deployment](https://vercel.com/docs/git) · [Environment variables](https://vercel.com/docs/environment-variables)
4. Bootstrap the tutor account using the steps above. Verify email delivery and sign-in from the deployed portal, then try a student and guardian invitation and a sandbox Stripe link.

## Validate

```sh
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
npx supabase@3.1.0 db lint --schema public,private --fail-on error
```

The browser suite requires local Supabase and Mailpit and starts Next.js on port 3100. It uses synthetic accounts and a local OpenAI HTTP fixture, with no billed AI calls. Browser and Data API assertions cover sign-in links, group isolation, quiz submissions and tutor review, private preparation, plan publication and completion, guardian access, API failures, and HEIC conversion. Use `npx supabase@3.1.0 db reset` to rebuild the disposable local database after migration edits.
