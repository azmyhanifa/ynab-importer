# AGENTS.md

## Cursor Cloud specific instructions

### What this is
`ynab-converter` (branded "YNAB Importer") is a single-page **Next.js 15 / React 19** app that converts bank data into YNAB transactions. It is **100% client-side** — there is no backend server, database, or required environment variable. All state (SMS format templates, card→account mappings, YNAB token, draft transactions) lives in the browser's `localStorage`.

Core flows (`src/app/page.tsx`):
- Upload a bank statement Excel file (`.xlsx`/`.xls`, parsed with `xlsx`) → converts to YNAB rows → download CSV (`papaparse`).
- Paste a bank SMS → `src/app/lib/smsParser.ts` guesses amount/payee/card/date → confirm once → the format is remembered for future pastes.
- Optional: "Push to YNAB" / payee matching hits the live YNAB REST API at `https://api.ynab.com/v1` directly from the browser.

### Running / building / testing
Scripts live in `package.json`; nothing custom beyond them:
- Dev server: `npm run dev` (Next.js + Turbopack, serves on `http://localhost:3000`).
- Lint: `npm run lint`. Build: `npm run build`. Prod serve: `npm run start`.
- There is **no automated test suite** (no Jest/Vitest/Playwright). Verify changes manually in the browser.

### Non-obvious notes
- Use **npm** (there is a `package-lock.json`); do not switch package managers.
- The YNAB API integration needs a **real YNAB Personal Access Token** (entered at runtime in the UI via the top-right "Connect to YNAB" menu, stored in `localStorage`) plus outbound network access to `api.ynab.com`. It is **not required** to demo the core Excel/SMS → CSV conversion, which works fully offline.
- Because state is persisted in `localStorage`, a stale draft/format can carry over between manual test sessions in the same browser profile — clear site data if a test starts from an unexpected state.
