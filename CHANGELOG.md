# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]
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
