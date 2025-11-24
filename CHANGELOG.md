# Changelog

## [0.3.0] - 2025-11-24

### Added
- `--slow` flag for slow-loading sites with 3x longer timeouts
- Tailwind CSS exporter (`lib/exporters.js`)
- Brand challenge test suite against SPA/heavy-JS sites (Tesla, Dribbble, SoundCloud, Airtable, Product Hunt, Behance)
- GitHub Actions CI workflow for automated testing
- Border detection with confidence scoring

### Changed
- Improved terminal output with tree structure
- Enhanced retry logic for empty content
- Better SPA hydration detection
- Test suite refocused on SPA and interactive sites
- Lowered content validation threshold from 500 to 100 chars for minimal-text sites
- Clearer border style display with `(per-side)` label for shorthand values

## [0.2.0] - 2025-11-22

### Added
- `--dark-mode` and `--mobile` flags
- Clickable terminal links
- Enhanced bot detection avoidance

## [0.1.0] - 2025-11-21

Initial public release
