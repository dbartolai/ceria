# Ceria — Design System

## Brand Identity

Ceria is a premium, personalized tutoring experience.

The brand should feel intelligent, warm, elegant, approachable, and academically rigorous. It combines the sophistication of editorial design with the clarity and functionality of modern educational software.

Think: boutique academic studio meets beautifully designed textbook.

Avoid conventional EdTech aesthetics: bright primary colors, gamification-heavy interfaces, dense dashboards, generic SaaS layouts, and excessive gradients.

## Design Philosophy

- Editorial over corporate: Strong typography, intentional composition, and restrained decoration.

- Calm over stimulating: Generous whitespace, muted colors, and minimal visual noise.

- Clarity over complexity: Every screen should have an obvious purpose and hierarchy.

- Premium but approachable: Elegant without feeling overly formal or inaccessible.

- Instruction-first: Mathematical notation, diagrams, questions, and explanations are central visual elements.

Use the provided reference images as the primary visual inspiration.

## Color Palette

Warm ivory backgrounds, charcoal typography, soft teal accents, and subtle golden highlights.

Suggested starting tokens:

| Token | Color | Usage |

|-------|-------|-------|

| Background | #FAF8F3 | Primary application background |

| Surface | #FFFEFB | Cards, panels, elevated surfaces |

| Foreground | #302D29 | Primary text |

| Muted | #77736E | Secondary text, metadata |

| Border | #E7E0D6 | Dividers, outlines |

| Primary | #397F7D | Teal accents, links, active states |

| Primary Light | #B7DAD6 | Diagrams, selected regions |

| Accent | #EFB54E | Golden highlights and emphasis |

| Accent Light | #FBF1DF | Subtle gold backgrounds |

Use colors sparingly. Most of the interface should remain neutral.

Teal represents learning, progress, and interaction. Gold provides occasional warmth and emphasis.

A subtle teal-to-gold gradient may be used for thin progress indicators or decorative rules, but never as a dominant background.

## Typography

Use a complementary serif and sans-serif pairing.

Display / Editorial

- Preferred: Cormorant Garamond or similar elegant, high-contrast serif.

- Used for prominent headings, lesson titles, question prompts, and major results.

- Large, expressive, and often lightweight.

Interface / Body

- Preferred: DM Sans or similar clean, humanist sans-serif.

- Used for navigation, controls, paragraphs, labels, and supporting text.

- Prioritize excellent readability.

Mathematics

- Use KaTeX or equivalent for professionally typeset mathematical expressions.

- Mathematical notation must remain legible and properly aligned.

Typography guidelines:

- Strong contrast between large serif headings and smaller sans-serif descriptions.

- Small uppercase labels with generous letter spacing for section identifiers.

- Comfortable body line heights.

- Avoid overly bold headings and excessive font-weight variation.

- Use tabular numerals for scores, dates, and financial values.

## Layout and Spacing

- Spacious, intentional layouts with generous margins.

- Clear visual hierarchy and limited content per screen.

- Editorial compositions where appropriate, including asymmetric two-column layouts.

- Narrow, readable content widths for text-heavy pages.

- Consistent spacing using a defined scale.

- Responsive layouts that preserve breathing room on mobile.

Student quizzes should feel immersive and focused, showing one question at a time when appropriate.

Administrative pages may be denser, but should retain Ceria's typography, colors, and restrained visual language.

## Components

### Cards and Panels

- Soft ivory or off-white surfaces.

- Thin, warm-neutral borders.

- Moderately rounded corners (12–20px).

- Very subtle shadows, if any.

- Comfortable internal padding.

- Avoid heavy outlines or excessive nesting.

### Buttons and Inputs

- Clean, understated, accessible.

- Primary buttons use deep teal.

- Secondary actions use neutral outlines or quiet text styles.

- Clearly distinguish hover, focus, selected, and disabled states.

- Inputs should feel integrated with the overall editorial aesthetic.

### Navigation

- Minimal and predictable.

- Prioritize content over navigation chrome.

- Tutor portal may use a restrained sidebar.

- Student and parent portals should have simpler navigation.

- Avoid cluttered toolbars and unnecessary controls.

### Feedback and Progress

- Use subtle progress lines, clear status labels, and concise explanations.

- Prefer factual feedback over celebratory animations.

- Correct answers may use warm gold or teal highlights.

- Incorrect answers should be clear but not discouraging.

- Avoid oversized badges, confetti, or aggressive gamification.

## Educational Content

Educational materials are a defining part of Ceria's identity.

### Questions

- Large, elegant serif question titles.

- Small uppercase subject/topic identifiers.

- Concise supporting instructions.

- Generous separation between prompts, visuals, and answers.

- Answer choices presented as clean, outlined cards with letter labels.

### Diagrams

- Clean vector illustrations, preferably SVG.

- Thin teal outlines and softly filled geometric shapes.

- Subtle dotted backgrounds or grids where helpful.

- Use color and hatching to distinguish relevant regions.

- Clear legends, labels, dimensions, and annotations.

- Favor precise diagrams over generic illustrations.

### Explanations

- Give correct answers a clear visual hierarchy.

- Pair explanations with meaningful diagrams where useful.

- Emphasize the underlying mathematical reasoning.

- Keep explanations digestible rather than visually overwhelming.

## Portal-Specific Direction

### Tutor Portal

A sophisticated but efficient workspace.

- Clear student and engagement management.

- Streamlined lesson creation and publishing.

- Practical tables, forms, and content editors.

- Minimize unnecessary clicks and decorative UI.

### Student Portal

A calm, focused learning environment.

- Prominent upcoming assignments and session information.

- Beautiful quiz-taking and review experiences.

- Minimal distractions during practice.

- Clear, supportive feedback.

- No requirement for extensive analytics or gamification.

### Parent Portal

A polished, trustworthy client experience.

- Upcoming sessions and scheduling.

- Invoices, payments, and payment links.

- Concise session recaps.

- Simple navigation and clear next actions.

- Professional, service-oriented presentation.

## Motion and Interaction

- Subtle hover transitions and gentle fades.

- Fast, responsive interactions.

- No unnecessary animations or distracting effects.

- Respect reduced-motion preferences.

- Interactive states must be accessible and keyboard navigable.

## Implementation Guidelines

- Use Tailwind CSS and reusable design tokens.

- Build consistent shared UI primitives.

- Apply the same visual language across all portals.

- Implement responsive layouts from the beginning.

- Maintain accessible contrast, focus states, and touch targets.

- Prioritize visual consistency over introducing new component styles.

## North Star

Ceria should feel like opening a beautifully designed academic journal that happens to be interactive.

It should inspire confidence in parents, focus in students, and efficiency for the tutor.

Understated sophistication. Educational clarity. Thoughtful details.

