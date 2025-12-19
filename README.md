# RapidTools Validation API

API-first validation service for structured data formats with deterministic validation and idempotent operations.

## Links

- **Canonical manifest**: https://validation.rapidtools.dev/manifest.json
- **Directory entry**: https://directory.rapidtools.dev

**The manifest is the canonical contract. This repository implements it.**

## Contract

- Breaking changes require a versioned manifest update.
- Runtime behavior must match manifest.

## Purpose

Deterministic CSV validation with no persistent side effects.
Designed for machine and automation use.

## Security

Report vulnerabilities to security@rapidtools.dev. See disclosure policy: https://directory.rapidtools.dev/security

## Monitoring

Monitor these endpoints:
- `GET /health` - Service health check
- `GET /api/types` - List validation types (requires API key)

**Notes:**
- Use a dedicated monitoring API key; do not use admin secret.
- Alerts currently email-only.

## Notes

- No UI
- No SDK
- No hidden behavior
