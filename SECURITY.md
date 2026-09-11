# Security Policy

Do not report security vulnerabilities through a public issue. Configure a private security contact before launch and publish that address in this file and in the application privacy documentation.

## Sensitive configuration

`SUPABASE_SERVICE_ROLE_KEY` and `LIVEKIT_API_SECRET` must exist only in server-side environment variables. Never prefix them with `NEXT_PUBLIC_`, place them in source control, return them from an API response, or expose them in browser logs.

## Authorization model

PostgreSQL Row Level Security is the primary authorization boundary. Interface-level hiding is only a usability control. Changes to policies or security-definer functions require peer review and cross-organization isolation tests.

## Incident preparation

Before launch, designate a security contact, enable provider audit logs, document key rotation, test database restoration, configure error alerts, and define how compromised accounts and public game links will be revoked.
