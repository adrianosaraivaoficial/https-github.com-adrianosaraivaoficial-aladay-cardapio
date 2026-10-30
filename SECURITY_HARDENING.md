# Security hardening — 30/10/2026

## Changes in this branch

- JWT validation now requires HS256, a valid HMAC signature, the expected issuer, a subject, and a non-expired `exp`.
- Production startup fails closed if `JWT_SECRET` is missing or shorter than 32 characters. Generate a value with `openssl rand -hex 48`.
- Removed embedded fallback JWT secrets and unsigned/bootstrap-token acceptance.
- Removed the default administrator password. Configure `ADMIN_PASSWORD` in the server environment; it is hashed with scrypt at startup. Use a unique password with at least 12 characters.
- Owner passwords are stored as scrypt hashes and login uses timing-safe verification.
- OTP generation uses a cryptographically secure random generator, checks the registered phone and expiration, and no longer returns the OTP in the API response.
- Evolution API credentials are read from environment variables instead of source-code literals.
- The environment example no longer contains an integration key. It documents required secret variables.
- Pix webhook confirmation now requires a shared secret and a matching pending transaction/order/amount; automatic approval defaults to disabled.
- Added authentication to selected sensitive admin, notification, product, tenant-settings and integration routes.
- Tenant API responses omit internal Evolution credential properties.

## Required actions before deploying

1. Set a new strong `JWT_SECRET`, `ADMIN_PASSWORD`, `EVOLUTION_API_KEY`, and `PIX_WEBHOOK_TOKEN` in the server environment. Do not paste secrets into GitHub or chat.
2. **Rotate the Evolution API key immediately.** A credential was present in the repository's previous source and environment template. Removing it from the current files does not erase it from Git history.
3. Confirm that the configured administrator phone number is present in the user record if WhatsApp OTP login is used.
4. Configure the Pix provider to send the exact `PIX_WEBHOOK_TOKEN` in the `x-webhook-token` header. Test with a real provider sandbox before enabling payments.
5. Review all API routes and enforce tenant ownership server-side. This branch adds guards to important routes but is not a complete authorization audit.
6. Move users, OTPs, subscriptions, tenants and transactional records to PostgreSQL with tenant-scoped constraints. Several application paths still use in-memory state; restarting the service can lose data and multi-instance operation is not safe yet.
7. Run dependency installation, TypeScript checks, production build, automated authorization tests and payment-webhook tests before deployment.

## Important limitations

This is an initial hardening pass, not a certification or a guarantee of full OWASP/LGPD compliance. In particular, public onboarding/trial flows, complete tenant isolation, persistence, webhook provider-specific signature verification, and end-to-end regression tests still require review. Do not merge or deploy to production until those checks pass.

The 15-day trial UI and flow from the current `main` commit are retained because this branch is based on that repository revision.
