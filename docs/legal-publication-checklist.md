# Policy review and publication checklist

The routes \`/privacy\` and \`/terms\` already exist in the React website and bridge fallback renderer. This change updates the shared \`site/*.md\` content to cover central Supabase Auth (including Google basic profile information), hosted MCP, Connect, device pairing, Cloudflare, Stripe and ePaperclip's local-vs-hosted boundaries. Legal text is material and should receive human approval before production rollout.

## Owner decisions and verifications needed

- [ ] Verify who the legal service operator actually is and whether "KpnWorld" is the correct public name; if a legal entity exists, provide its official name and location. Do **not** represent an unregistered project as an LLC/corporation.
- [ ] Verify \`support@papercliped.co\` works as a monitored mailbox for privacy, deletion, and legal requests; update CONTACT fallback if needed.
- [ ] Confirm age policy (prior privacy policy said "not intended for under 18"; this revision preserves that position pending review).
- [ ] Confirm the *actual* Google scopes and fields requested: basic \`openid email profile\`, not Gmail/Drive/Calendar. Any additional Google API scopes require corresponding disclosures.
- [ ] Verify whether account provider profile fields are stored in Supabase Auth and the exact retention, deletion, and export workflow.
- [ ] Verify current retention intervals for gateway activity logs, Connect audit and provision jobs, Stripe subscriptions/invoices, provider logs, and account identity records. The policy avoids inventing one uniform deletion period.
- [ ] Confirm payment-renewal disclosure, subscription cancellation, refund rights and any billing terms against the real Stripe Checkout and customer portal.
- [ ] Confirm relevant legal jurisdiction, consumer rights, operating contact, and any jurisdiction-specific policies with qualified legal review.
- [ ] Confirm marketing-site no-trackers statement remains accurate after deployment.
- [ ] Verify links to \`/privacy\` and \`/terms\` are public, accessible without login and return HTTP 200 on \`https://papercliped.co\` (not only in Vite tests).
- [ ] Add the exact same public privacy URL to Google Auth Platform → Branding. Ensure the verified homepage links to the same policy URL; confirm search-console domain verification.
- [ ] Put visible policy links in central Auth/Console/Connect account-facing screens, particularly the Google consent or registration entry points.
- [ ] Check that deployed Render bridge has the updated \`site/\` content and built \`web/dist\`. A GitHub PR alone is **not** a production deployment.
- [ ] Verify policy effective date matches the actual publication date if release occurs later.

## Tests

- React site route and link checks (desktop/mobile, light/dark).
- Bridge fallback \`SiteRoutes\` tests, policy placeholder substitution and escaping.
- Confirm production \`/privacy\` and \`/terms\` with real HTTPS, no authentication or redirects to sign-in.
- Validate policy disclosures against actual current OAuth scopes and logged provider data.

**Do not mark Google brand verification complete merely because the policies render.** Google still controls verification, and inaccurate claims or unresolved legal-owner details may cause rejection.
