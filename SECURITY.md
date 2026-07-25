# Security Policy

## Supported versions

Pre-1.0. Only the latest published `0.x` release receives fixes. Upgrade before reporting.

## Reporting a vulnerability

Report privately. Do not open a public issue for a security bug.

- Preferred: GitHub private vulnerability reporting (repository **Security** tab -> **Report a vulnerability**).
- Alternative: email dembrandt@tutamail.com.

Include the version, the command or MCP call, the target URL if relevant, and a reproduction. Expect an acknowledgement within a few days.

## Scope

dembrandt drives a headless browser against arbitrary third-party URLs and parses their DOM, CSS, and assets. Treat all extracted output as untrusted input. In-scope reports include: sandbox or navigation escapes, code execution from crafted page content, credential or token leakage (`--key`, cookies), and path traversal in output writing. Denial of service from a hostile page (hangs, memory) is lower priority and usually handled by the existing timeouts.
