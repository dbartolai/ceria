
# Tutoring Platform — Product Specification

## Overview

Build a polished, lightweight tutoring platform for a single independent tutor serving students and parents.

The platform should make tutoring feel like a comprehensive, personalized service through structured lesson materials, practice quizzes, session recaps, and simple client management.

Support both ongoing engagements (e.g., SAT/ACT preparation) and one-off sessions (e.g., trigonometry exam review). Group tutoring must also be supported.

Prioritize simplicity, flexibility, and a professional user experience. Follow `DESIGN.md` for all visual design decisions.

## Tech Stack

- Next.js, TypeScript, Tailwind CSS
- Supabase: PostgreSQL, Auth, Storage, RLS
- Vercel: hosting and deployment
- Stripe: hosted invoices and payment links
- AI: manual ChatGPT workflow initially, optional API integration later

## User Roles

### Tutor (Admin)
- Create and manage students, guardians, engagements, and sessions.
- Support individual and group engagements.
- Manage scheduling, materials, quizzes, invoices, and session recaps.
- Configure features and preferences per student or engagement.
- Review student submissions and performance.
- Edit and approve all generated content before publishing.

### Student
- Access a personalized dashboard with upcoming sessions and assignments.
- Complete interactive quizzes with feedback and explanations.
- Review previous quizzes, mistakes, and lesson materials.
- View session summaries and relevant learning goals.
- Access the portal easily through passwordless authentication.

### Parent / Guardian
- View upcoming and previous sessions for their students.
- Access session recaps and relevant scheduling information.
- View invoices, payment status, and hosted payment links.
- Manage payment methods through Stripe-hosted pages.
- Support multiple guardians per student and multiple students per guardian.

## Core Data Model

- Users and roles
- Students and guardian relationships
- Engagements (one-off, short-term, ongoing)
- Engagement participants
- Sessions and session participants
- Session notes and recaps
- Quizzes, questions, and answer explanations
- Assignments and student submissions
- Learning materials and file attachments
- Invoices and payment references
- Per-student and per-engagement settings

Students may participate in multiple engagements. Sessions may contain multiple students. Shared materials must coexist with individual assignments, submissions, and private notes.

## Core Workflows

### 1. Client Onboarding
- Tutor creates a student and optionally links guardians.
- Assign student to an engagement or create a new one.
- Invite users by email.
- Use one-time magic links with persistent sessions.
- Users can bookmark a stable `/portal` URL; no permanent authentication tokens in URLs.

### 2. Engagement and Session Management
- Tutor creates one-off or recurring tutoring engagements.
- Add one or more students to each engagement.
- Create, edit, and cancel sessions.
- Store dates, times, duration, location/meeting link, and notes.
- Display scheduling information in student and parent portals.
- Support calendar invitations; advanced self-booking is not required.

### 3. Post-Lesson Workflow
After each session, the tutor can:
1. Record topics covered, strengths, weaknesses, and next steps.
2. Create or generate a practice quiz.
3. Prepare a student-facing summary and parent-facing recap.
4. Edit and approve content.
5. Publish materials and notify relevant users.

Optimize this workflow for speed and minimal administrative effort.

### 4. Quizzes and Assignments
- Support multiple-choice, short-answer, and numeric questions.
- Store correct answers, explanations, and topic labels.
- Allow tutor-created, imported, and AI-generated quizzes.
- Support individual and group assignment distribution.
- Automatically grade objective questions where reliable.
- Allow manual review and grading of other responses.
- Track completion, scores, and missed questions.
- Students can revisit explanations and previous submissions.
- Allow question reuse across different engagements.

### 5. AI-Assisted Content Creation
AI must be optional, not a dependency for core functionality.

Initial workflow:
- Generate structured, reusable prompts from lesson notes and settings.
- Allow tutor to copy prompts into ChatGPT.
- Import structured responses back into the application.
- Parse imported quizzes and recaps into editable drafts.
- Validate imported content and require tutor approval before publishing.

Design the AI integration as a replaceable service layer so direct API generation can be added later without restructuring the application.

AI use cases include quiz generation, lesson planning, practice materials, and session recaps.

Avoid sending unnecessary student personal information to AI services.

### 6. Parent Portal
Keep the experience minimal:
- Upcoming sessions and session history
- Approved session recaps
- Invoices and payment status
- Secure payment links and payment-method management

Use Stripe-hosted financial workflows. Do not store raw payment credentials.

### 7. Settings and Customization
Support engagement-level defaults with per-student overrides.

Configurable options should include:
- Enabled features
- Quiz and assignment preferences
- Parent notifications
- Student learning goals
- Engagement type and test preparation settings
- Access to optional features such as learning roadmaps

Prefer configurable behavior over hardcoded assumptions.

## Analytics and Progress

Display objective, directly observed information:
- Sessions completed
- Assignments completed
- Quiz scores and submission history
- Topics covered
- Recorded goals and milestones

Do not invent mastery percentages, predicted test scores, or progress metrics without sufficient evidence.

One-off engagements should provide value without requiring diagnostics, longitudinal data, or ongoing assignments.

## Security and Permissions

- Implement role-based access with Supabase RLS.
- Students access only their authorized information.
- Guardians access only their linked students' permitted information.
- Group participants cannot access each other's private submissions or notes.
- Tutor-only notes remain private.
- Secure invitation, authentication, storage, and payment workflows.
- Account for handling educational information belonging to minors.
- Store secrets server-side; never expose service-role or payment keys.

## UX Requirements

- Responsive, mobile-friendly experience.
- Minimal navigation and friction for students and guardians.
- Fast onboarding and easy return visits.
- Tutor dashboard optimized for daily administrative work.
- Clear empty states for new students and one-off engagements.
- Avoid unnecessary dashboards, analytics, or gamification.
- Use `DESIGN.md` as the source of truth for typography, colors, components, and visual style.

## MVP Boundaries

Include all core workflows above.

Exclude initially:
- Multi-tutor SaaS functionality
- Advanced analytics and predictive scoring
- AI student chat assistant
- Complex scheduling automation
- Gamification systems
- Subscription billing infrastructure
- Native mobile applications

Favor maintainable, straightforward implementations over elaborate abstractions.

## Definition of Done

- Tutor can onboard students and guardians.
- Tutor can create individual and group engagements and sessions.
- Students and guardians can securely access their portals.
- Tutor can create, import, edit, assign, and publish quizzes.
- Students can complete quizzes and review results.
- Tutor can publish session recaps to the appropriate users.
- Parents can view sessions, recaps, and invoices/payment links.
- Role permissions and group privacy are enforced and tested.
- Core workflows function without any AI API connection.
- Application builds successfully and is deployable to Vercel with Supabase.
