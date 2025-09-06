# Repository Guidelines

## Project Structure & Module Organization
- Entry point: `index.js` (Node ESM, requires Node >= 18).
- Scrapers: `fn/*.js` (e.g., `spareroom.js`, `rightmove.js`, `zoopla.js`, `foxtons.js`).
- Services: `services/*.js` (Telegram bot, SpareRoom messenger).
- Utilities: `utils/*.js` (config, logging, HTTP, files, validation, queues).
- Config: `config/searches.json` and `config/messageTemplate.js`.
- Data: `listings/` (generated JSON snapshots; ignored by nodemon).
- Scripts: `health-check.js`, `deploy-ec2.sh`, `test-*.js` in repo root.

## Build, Test, and Development Commands
- `npm start` — runs the monitoring bot (`node index.js`).
- `npm run health` — environment/system sanity checks (Node, env vars, browser, config).
- `npm run deploy` — EC2 deployment helper script.
- Local dev: `npx nodemon index.js` (uses `nodemon.json` to ignore `listings/`).
- Ad‑hoc tests: `node test-messaging.js`, `node test-spareroom-images.js`.

## Coding Style & Naming Conventions
- Language: JavaScript (ES Modules). Import with `import ... from '...'` and use `.js` extensions.
- Indentation: 4 spaces; max line width ~100–120 chars; trailing commas optional.
- Naming: camelCase for variables/functions; PascalCase for classes.
  - Files: utilities/services use camelCase (e.g., `fileUtils.js`); scrapers in `fn/` are lowercase vendor names.
- Logging: use `utils/logger.js` (info/warn/error/debug/performance/lifecycle) instead of `console.*`.
- Avoid introducing new dependencies without discussion.

## Testing Guidelines
- No formal test framework; use executable Node scripts under the repo root named `test-*.js`.
- Run with `node <script>.js`. For Playwright tests, prefer headless in CI (`headless: true`).
- Ensure required env vars are present for tests (e.g., `TELEGRAM_BOT_TOKEN`, `CHAT_ID`, `SPAREROOM_EMAIL`, `SPAREROOM_PASSWORD`).

## Commit & Pull Request Guidelines
- Commits: small, focused, imperative mood (e.g., "Add Rightmove parsing fallback", "Fix Telegram rate limiting"). Optional prefixes: `feat:`, `fix:`, `refactor:`, `chore:`.
- PRs: include summary, rationale, before/after behavior, and any screenshots/logs. Link related issues. Note config/env impacts.

## Security & Configuration Tips
- Use `.env` for secrets (`TELEGRAM_BOT_TOKEN`, `CHAT_ID`, optional `ZOOPLA_COOKIES`, etc.). Never commit secrets.
- Keep `config/searches.json` valid; only enabled searches are processed.
- Chrome/Chromium: set `CHROME_PATH` if needed; verify with `npm run health`.

