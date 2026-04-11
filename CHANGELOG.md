# Changelog

## [0.3.0] - 2025-11-24

### Added
- `--slow` flag for slow-loading sites with 3x longer timeouts
- Tailwind CSS exporter (`lib/exporters.js`)
- QA test suite for visual comparison and regression detection
- GitHub Actions CI workflow for automated testing
- Border detection with confidence scoring

### Changed
- Improved terminal output with tree structure
- Enhanced retry logic for empty content
- Better SPA hydration detection
- Test suite refocused on SPA and interactive sites
- Lowered content validation threshold from 500 to 100 chars for minimal-text sites
- Clearer border style display with `(per-side)` label for shorthand values
- Shadows now sorted by confidence and usage frequency (most confident first)
- Button detection now includes outline/bordered buttons (previously skipped transparent backgrounds)

## [0.2.0] - 2025-11-22

### Added
- `--dark-mode` and `--mobile` flags
- Clickable terminal links
- Enhanced bot detection avoidance

## [0.1.0] - 2025-11-21

Initial public release
