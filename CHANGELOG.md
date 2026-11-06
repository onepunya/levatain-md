# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]
### Added (agent)
- Agent for everyone, not only the owner: regular users get safe tools (`web_search`, `web_read`, `calc`, `time_now`, `note_*`, `remind*`, `run_plugin`) with a smaller step budget and an hourly cap (`AGENT_USER_STEPS_PER_HOUR`). Owner-only tools stay owner-only.
- Web tools without API keys: `web_search` (DuckDuckGo → DDG Lite → Bing fallback) and `web_read` (readable text, paging, SSRF protection: private/local IPs, redirects and DNS are checked on every hop).
- `run_plugin`: run any bot command from inside the agent and read its text output, so features can be chained (e.g. check balance, then decide). Media still goes straight to the chat; normal access rules, limits and the praise gate apply.
- Parallel tool calls: independent read-only tools can be batched in one response (`"tools":[...]`, max `AGENT_MAX_PARALLEL`). Mutating tools run one by one and stop after the first failure.
- Reminders and scheduled tasks (`src/runtime/scheduler.js`): `remind`, `remind_list`, `remind_cancel` for everyone, `schedule` (owner) runs an agent task at a set time or repeatedly and sends the result to the chat. Persisted in `database/schedules.json`.
- Long-term memory: `note_save / note_find / note_list / note_delete` per user, plus automatic summarising of old conversation (history folds into a rolling summary instead of being dropped).
- Official Gemini API as fallback (`GEMINI_API_KEY`) when the cookie provider is empty or fails.
- Prompt injection guard: after `web_search`, `web_read` or `httpget` in a run, tools that write files, run code, post data, run privileged plugins or schedule tasks are blocked until the next message. Web output is tagged as untrusted for the model.
- `NOW` line (bot timezone) in the system prompt; `BOT_TIMEZONE` setting.
- `scripts/test-agent-v2.js` (156 checks); `npm run test:agent` runs both suites.

### Changed (agent)
- JSON reply parser picks the outermost object (needed for batched tool calls).
- `rules.txt` rule 15 now applies to every user; new `rules-tools.txt` (rules 18–25).

### Added
- `ctx.reply / send / react / del / typing` on every plugin context (`src/wa/reply.js`); `reply` also accepts media content objects. `sendTo(sock, jid, …)` covers sends with no incoming message (timers, schedulers).
- `resolveTarget(ctx)` in `core/identity.js` and `normalizeJid / findParticipant / jidTag` in `wa/jid.js`, replacing eight hand-written copies.
- `wa/group.js` (`kick`, `promote`, `demote`, `addMember`, `inviteLink`, …) and `wa/profile.js` (`getAbout`, `getAvatarUrl`, `getBusiness`).
- `plugin().botAdmin()` guard (works for both prefix commands and AI-triggered runs).
- `npm test` with unit tests for the helpers and the group plugins.
- Menu thumbnail can be a video (`BOT_THUMB` with `.mp4`), sent as a looping GIF-style clip.
- MIT license, Docker, pm2 and systemd deploy files, CI workflow, community files.

### Fixed
- @mentions that were `@lid` were rewritten to `<id>@lid@s.whatsapp.net` in kick/warn/tembak; they now keep their `@lid` form.
- Device-suffixed LIDs (`123:5@lid`) are no longer turned into phone-number JIDs in roast / infouser / trade.
- `.beli` was registered by both `plan` and `buy`; removed the unreachable alias from `plan` (`buy` already handled it).
- Removed unused imports (`PLANS`, `getItem`, `ProgressMessage`).

### Changed
- No plugin calls `sock.sendMessage` directly any more (was 415 calls): they use `reply(...)`, `send(...)` or `sendTo(...)`; `typing(sock, from)` became `typing()`; four `isBotAdmin` guards became `.botAdmin()`.
- Group helpers refresh the group metadata cache after kick/promote/demote/add.
- Formatting cleanup: tab indentation in `src/api/*` converted to 4 spaces, trailing whitespace and column-alignment padding removed, final newlines enforced (matches `.editorconfig`).
- Restructured `src/`: `lib/` split into `util`, `wa`, `api`, `storage`, `limits`, `menu`, `media`, `dashboard`, `tools`.
- `index.js` reduced to 10 lines; connection logic moved to `src/runtime/`.
- `handler.js` and `globals.js` moved to `src/core/`; group rules moved to `src/groups/`; database files to `src/storage/`.
- Plugins now import from themed barrels instead of the single `lib/index.js`.

## [2.0.0]
- Initial public version.
