# Security hardening — 30/10/2026

## Corrections included in this branch

- JWT verification enforces HS256 HMAC signature, issuer, subject, issued-at, maximum lifetime, expiry, role and tenant claims.
- Production startup requires a 32-byte `JWT_SECRET`, valid `ADMIN_EMAIL`, and `ADMIN_PASSWORD` with at least 14 characters.
- Administrator and tenant-owner passwords use scrypt hashes and timing-safe verification.
- Tenant-owner registration requires a server-side active trial or confirmed subscription; an existing e-mail cannot be reused to reset a password.
- OTP uses cryptographic random generation, a SHA-256 digest at rest, a five-minute expiry, IP/account rate limits, and is never returned or written to logs.
- Evolution API credentials and webhook token are environment-only; Evolution webhook requests require a shared token.
- Pix checkout requires a real order, tenant match, exact server-side amount and configured merchant key. Public Pix status no longer returns customer/order data.
- Pix webhook checks its shared token, order/tenant/amount, expiry and EndToEndId. This is a shared-secret integration, not cryptographic verification with a bank/provider signature.
- Asaas webhook fails closed without its token, matches known subscriptions, and checks the expected amount. Client-side payment confirmation now verifies the payment against the Asaas API.
- Trial activation no longer creates a fake Pix payload, fake invoice URL or fake Asaas customer. It records a 15-day trial only; it does **not** automatically create or charge a recurring subscription.
- Public tracking omits customer phone, delivery address and internal logs. Sensitive order reads and admin/integration routes require authentication.
- Checkout prices and option prices are calculated from the server-side tenant catalog; browser-submitted prices are not accepted.
- Compose no longer contains fallback credentials and exposes the app only to its internal network by default.
- Added a GitHub Actions workflow for lockfile synchronization, TypeScript checking and production build.

## Required environment variables

Configure these only in the deployment environment (EasyPanel), never in Git:

- `JWT_SECRET`: at least 32 random bytes; generate with `openssl rand -hex 48`.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD`: unique administrator account; password at least 14 characters.
- `ADMIN_PHONE`: optional, required if WhatsApp OTP is used for the administrator.
- `DATABASE_URL`.
- `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_TOKEN`.
- `PIX_WEBHOOK_TOKEN`.
- `ASAAS_API_KEY` and `ASAAS_WEBHOOK_TOKEN` only when Asaas is configured.

## Mandatory actions before deployment

1. **Rotate the Evolution API key immediately.** A credential existed in the previous source and environment template. Removing it from the current files does not erase Git history.
2. Generate new values for `JWT_SECRET`, `ADMIN_PASSWORD`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_TOKEN` and `PIX_WEBHOOK_TOKEN`. Do not reuse values that appeared in repository history.
3. Configure the Evolution webhook to send `EVOLUTION_WEBHOOK_TOKEN` in the `x-evolution-token` header.
4. Configure the Pix provider to send `PIX_WEBHOOK_TOKEN` in the `x-webhook-token` header. Verify the provider's authenticity/signature mechanism separately before enabling automatic payment approval.
5. Only Pix subscription billing is currently enabled by the application changes in this branch. Credit card and boleto subscription flows are deliberately rejected until their data and provider flows are properly implemented.
6. Do not use the trial as an automatic billing authorization. No recurring Asaas charge is scheduled by the trial endpoint.
7. Run the GitHub Actions checks and end-to-end tests against a sandbox before merging or deploying.

## Known blockers — not production-ready as a multi-tenant SaaS

- Users, products, categories, orders, OTP state, trial/subscription records and rate limits still rely in part on process memory. Restarting the service or running multiple replicas can lose or split state.
- The current database initialization does not fully hydrate/persist every domain entity. Product catalog persistence and order/payment atomicity need a separate implementation.
- Tenant creation and public trial onboarding still need a one-time signed onboarding token to prevent a third party from claiming a newly created tenant before its owner.
- Tenant isolation has not been exhaustively audited across every API route and every SQL query. PostgreSQL row-level security, tenant-scoped foreign keys and comprehensive RBAC tests are still outstanding.
- Webhook authentication uses shared secrets; provider-native signatures and replay/idempotency validation must be implemented and tested where supported.
- No production deploy or database migration was performed by this PR.

This is an initial hardening pass, not an OWASP/LGPD certification or a guarantee of full security. Keep the PR in draft and do not deploy until the blockers above are addressed and the test suite passes.
