# Nexora production audit

_Audited: 2026-07-22_

## Verified baseline

- `npm run lint` completes without reported lint errors.
- `npm run build` completes successfully and prerenders the static application routes.
- Nexora is a Next.js 16.2.9 App Router project with TypeScript, Tailwind CSS 4, Zustand, Papa Parse, SheetJS, Recharts, Framer Motion, and Lucide.
- Current data handling is client-side. There are no server API routes, authentication providers, or external database integrations.

## Changes completed

| Area | Change | Why |
| --- | --- | --- |
| Import safety | Applied the published 25 MB limit to JSON and Excel files and the 50,000-row limit to Excel sheets. | Prevents unbounded browser memory and CPU use. |
| Import safety | Normalized imported cells to supported scalar values and use prototype-safe row construction. | Limits malformed or hostile data from affecting application object state. |
| Accessibility | Replaced the mouse-only upload surface with a labelled 40 px file-selection button; improved dialog dismissal and focus handling. | Makes key workflows operable with keyboard and assistive technology. |
| UI system | Consolidated the shell around one high-contrast data-workspace palette, responsive navigation, visible focus treatment, and bounded motion. | Improves scanability, mobile navigation, and motion accessibility without changing analysis workflows. |
| Product honesty | Replaced simulated authentication and database configuration with explicit local-workspace status and real local-data controls. | Avoids collecting or implying support for credentials that the app cannot safely use. |
| Build reliability | Set `turbopack.root` to the Nexora project directory. | Stops Next.js from selecting the parent workspace lockfile as the build root. |

## Remaining finding

1. **High — `xlsx` has known advisories with no npm audit fix.** Nexora uses SheetJS `xlsx` 0.18.5 for local Excel import. The new input-size and row caps reduce exposure, but cannot fully remediate upstream parser advisories. Replace it with a maintained compatible parser after validating XLSX import behavior, or remove XLSX support if the risk is unacceptable.
2. **Medium — test coverage is not configured.** Add unit coverage for parser limits, profiling, and cleaning; browser tests for import, join, SQL, and report flows; and accessibility checks for dialogs and primary routes.

## Recommended next increment

Add parser and workflow test coverage before introducing external connectivity. Any future connector should include server-side integration, encrypted secret management, authorization, and a clear threat model.
