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
3. In ceria, use **Clients** to create students and guardians and link families. Client email is optional until portal access is needed. Each portal account has one role and one unique email. Use **Copy sign-in link** to send access yourself, or send an invitation from the portal. Users can bookmark `/portal` and request a fresh link whenever their session expires.

## Tutor workflow

- Create an engagement, enroll its students, then schedule a session with the relevant participants. Sessions may be entered individually for recurring engagements. Download an ICS invitation to add it to a calendar or send it through a calendar app.
- On the session page, record private lesson notes. Draft separate student summaries and guardian recaps, including individual versions when needed. Published recaps, materials, and assignments send in-app notifications. Linked guardians receive notifications for published guardian recaps.
- Use **Quizzes** to write questions, reuse questions from saved drafts, or import quiz JSON. Review the draft and publish to selected students or the whole engagement. Draft changes leave published assignments and prior results intact.
- Use **Materials** to share text, worked examples, and private files. Save a material draft, then select multiple files under **Files**. Files upload individually and can be removed while the material is a draft. Each file can be up to 4 MB.
- Quizzes and materials are available to all engagements. Use the parts needed for each lesson. Existing recorded goals and milestones remain in student progress alongside completed work, reviewed scores, and published topics.

### Stripe billing

Create invoices or payment links in the Stripe Dashboard, then enter their URLs and status in ceria’s **Billing** screen. Update ceria’s invoice status when the Stripe record changes. The guardian’s payment-method link should be the persistent Stripe Customer Portal login link, which authenticates the customer by email. Use a Stripe sandbox to test the hosted pages before adding live links. [Hosted invoices](https://docs.stripe.com/invoicing/hosted-invoice-page) · [Payment Links](https://docs.stripe.com/payment-links) · [Customer Portal login](https://docs.stripe.com/customer-management/activate-no-code-customer-portal)

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

The browser suite requires the local Supabase stack and Mailpit and starts Next.js on port 3100. It uses synthetic accounts and a mix of browser and Data API assertions to check one-time email links, group isolation, quiz authoring and submission, tutor review, and guardian access. Use `npx supabase@3.1.0 db reset` to rebuild the disposable local database after migration edits.
