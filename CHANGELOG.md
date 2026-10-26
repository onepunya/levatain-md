# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]
### Added
- Menu thumbnail can be a video (`BOT_THUMB` with `.mp4`), sent as a looping GIF-style clip.
- MIT license, Docker, pm2 and systemd deploy files, CI workflow, community files.

### Fixed
- `.beli` was registered by both `plan` and `buy`; removed the unreachable alias from `plan` (`buy` already handled it).
- Removed unused imports (`PLANS`, `getItem`, `ProgressMessage`).

### Changed
- Formatting cleanup: tab indentation in `src/api/*` converted to 4 spaces, trailing whitespace and column-alignment padding removed, final newlines enforced (matches `.editorconfig`).
- Restructured `src/`: `lib/` split into `util`, `wa`, `api`, `storage`, `limits`, `menu`, `media`, `dashboard`, `tools`.
- `index.js` reduced to 10 lines; connection logic moved to `src/runtime/`.
- `handler.js` and `globals.js` moved to `src/core/`; group rules moved to `src/groups/`; database files to `src/storage/`.
- Plugins now import from themed barrels instead of the single `lib/index.js`.

## [2.0.0]
- Initial public version.
