# TypeNews theme review handoff (2026-07-31)

## Scope and constraints

- Project root: `C:\Users\guswn\Documents\typenews-vercel\typenews-main`
- Frontend: `frontend`
- Do not run `firebase deploy` unless the user explicitly requests it.
- The production TypeNews Firebase project and `typenews.kr` must not be touched.
- This review did not change product code or database data. Only this handoff document was added.
- The directory is not a Git repository, so there is no reliable `git diff` or commit history here.

## Current theme implementation

`VisualTheme` currently supports:

- `classic`
- `dark`
- `spreadsheet`
- `vscode`
- `terminal`

Main files:

- `frontend/lib/types.ts`
- `frontend/stores/use-settings-store.ts`
- `frontend/features/preferences/remote-preferences.ts`
- `frontend/components/settings/settings-menu.tsx`
- `frontend/components/layout/legacy-shell.tsx`
- `frontend/components/layout/spreadsheet-chrome.tsx`
- `frontend/components/layout/vscode-chrome.tsx`
- `frontend/components/layout/terminal-chrome.tsx`
- `frontend/components/typing/typing-workspace.tsx`
- `frontend/app/globals.css`

## Finding 1: broken CMD screen

Severity: high for UI, no direct scoring impact.

The attached broken screen shows new terminal JSX rendered with old CSS. This is not the intended terminal layout.

Evidence:

- `legacy-shell.tsx` renders `TerminalChrome` and `TerminalWorkbench` when the persisted value is `terminal`.
- Current `globals.css` has an unconditional rule around line 4807:
  `.terminal-chrome, .terminal-workbench { display: none; }`
- It only shows and styles them under `html[data-visual-theme="terminal"]`.
- In the broken screenshot the terminal elements are visible as unstyled text. Therefore the browser has the new JS/HTML but does not have the matching terminal CSS chunk.
- The same source was rebuilt cleanly and displayed correctly at 1280x720 with no document overflow or console warnings.

Most likely cause:

- `next dev` and `next build`/`next start` used the same `.next` directory while a server was running, or an old CSS chunk remained cached after HMR/rebuild.
- This project has previously shown stale CSS when a production build was run against the same `.next` directory as a running dev server.

Recovery sequence:

1. Stop every Next process serving this frontend.
2. Confirm port 3000 ownership before stopping it.
3. Remove only `frontend/.next` after resolving its absolute path and confirming it is inside this frontend.
4. Run exactly one mode: `npm run dev` for development, or `npm run build` followed by `npm run start` for production verification.
5. Hard reload the browser once.
6. Do not run `next build` while `next dev` is using the same `.next` directory.

Hardening worth implementing:

- Apply the persisted visual theme to `<html>` before React paints, using a small pre-hydration script in the root layout. `legacy-shell.tsx` currently assigns `document.documentElement.dataset.visualTheme` in `useEffect` (around lines 71-73), which can still produce a short classic-theme flash even when JS and CSS match.
- Add one browser regression check that selects every theme, reloads, and asserts the expected chrome is visible and the document has no X/Y overflow.

## Finding 2: scoring and event integrity

No theme-specific scoring regression was found in static review.

Why the theme itself does not alter scores:

- `visualTheme` is consumed by settings, `legacy-shell.tsx`, display measurement, and CSS/layout branches.
- It is not included in `scoreForSentence`, `calculateMetrics`, `PendingScore`, the Supabase RPC arguments, monthly ranking, or prize draw inputs.
- All themes render the same `TypingWorkspace`; they change presentation around the same input, alignment, completion, batching, and submission functions.

Existing defenses remain intact:

- Client only awards a score at accuracy >= 80% (`typing-workspace.tsx`, around lines 1250-1254).
- Scripture mode exits before `recordResult`, `submitScore`, and behavior tracking.
- Word mode batches up to 10 words and calculates CPM over at least 5 words.
- Pending scores are stored before sending and use UUID submission keys.
- The server rejects accuracy below 80%, CPM outside 0-5000, implausible elapsed time, impossible typing speed, duplicate submission keys, and more than 60,000 points per hour (`0029_total_count_excludes_words.sql`).
- Short and long scores are recalculated from enabled DB sentence text (`0032_enforce_server_sentence_score.sql`).
- Word scores are recalculated from each submitted DB sentence ID; news scores are recalculated from the trusted Vercel-registered RSS source (`0034_enforce_word_news_score.sql`).
- The draw snapshots candidates from `monthly_stats.score`; it does not read theme settings (`0030_draw_pool_snapshot.sql`).

Residual risk:

- There is no automated end-to-end test that completes a sentence in every theme and proves the same outbox/RPC payload is produced. The code path is shared, so the risk is low, but event operation deserves this regression test before domain cutover.
- Do not test this against production accounts by generating bulk points. Prefer a development user/month or intercept the RPC payload in a local browser test.

Tests run during this review:

- `npx tsx ../scripts/test-score-outbox.mts` passed.
- `npm run test:alignment` passed.
- `npm run test:background-presets` passed.
- `npm run test:news` passed.
- `npm run test:winner-shipping` passed.
- TypeScript, ESLint, and a production Next build had already passed after the theme changes.

Expected warnings in `test-score-outbox.mts` deliberately exercise network failure, stale entries, corrupt storage, and unavailable storage. The assertions all passed.

## Finding 3: word mode is not discreet

The user's observation is correct. The shared animated word dial is visually distinctive in all loafing themes.

Current behavior:

- Spreadsheet: words appear as a centered selectable list in the formula area.
- VS Code: the word carousel appears inside one highlighted code line.
- CMD: the same carousel appears after `PROMPT>`.
- The moving previous/current/next word slots and fading animation look like a typing game rather than ordinary work.

Recommended theme-specific presentation while keeping the exact same scoring logic:

- Spreadsheet: remove the dial visually. Put only the current word in the formula bar, and mirror it into the selected sheet cell. Use nearby cells as plausible review rows, not previous/next words.
- VS Code: show only the current word as a string value or object field such as `const token = "...";`. Put the typed value on the same code line and update a comment/status line for metrics.
- CMD: show one current token after a normal command prompt, for example `review-token --value "..."`, with typed input on the next prompt line. Do not show a carousel.
- Keep the existing `isWordMode`, word queue, 5-word CPM window, 10-word score batch, sentence IDs, and server verification untouched. Add theme-only render components or CSS branches around the existing current word.
- Preserve keyboard focus, IME composition handling, completion rules, clipboard blocking, and `finishCurrentSentence()`.

## Recommended next work order

1. Reproduce the CMD mismatch with the user's normal launch command and make the build/dev workflow deterministic.
2. Add pre-paint theme hydration to prevent a classic-theme flash.
3. Replace the word dial only in `spreadsheet`, `vscode`, and `terminal` with discreet theme-native views. Keep classic/dark behavior unchanged.
4. Add a browser regression matrix for `short`, `long`, `word`, and `news` across all five themes.
5. For the event-sensitive cases, assert identical completion eligibility, accuracy, score, mode, item count, sentence/source IDs, and submission key regardless of theme.
6. Re-run TypeScript, ESLint, production build, score-outbox tests, and browser checks at 1280x720 plus a smaller viewport.

## Do not change casually

- `finishCurrentSentence()` score eligibility and batching.
- `scoreForSentence()` or alignment rules.
- `features/scoring/score-outbox.ts` retry/idempotency behavior.
- Migrations `0029`, `0032`, and `0034` without a matching server/client verification plan.
- Prize draw weighting or `monthly_stats` while working on themes.
