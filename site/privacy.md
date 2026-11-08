# Privacy Policy

**Service:** Papercliped and the related Papercliped Account, Connect and hosted Console services at {{URL}} and their Papercliped subdomains  
**Operator:** KpnWorld ("Papercliped", "we" or "us")  
**Contact:** {{CONTACT}}  
**Effective date:** {{DATE}}

This policy explains what information is handled when you visit the Papercliped website, sign in to a Papercliped account, connect an AI client to the hosted MCP gateway, or use Papercliped Connect with an ePaperclip device. Some features are still being developed; information is processed for a feature only if you actually use it.

Software installed and operated locally on your own machine may retain separate operational data under your control. The hosted services do not thereby become the administrator of your Proxmox system.

## Information we receive

- **Account and login information.** Account ID, chosen username, and, if you enroll in central sign-in, your email address, authentication-provider identity identifier, email verification status and linked sign-in method. We retain hashes or other protected representations of account secrets and session tokens rather than storing those tokens as readable credentials.
- **Google Sign-In information.** If you choose Google, Google and our identity provider may provide your Google account identifier, email address and email-verification status, and, depending on the permissions you approve, your name and profile photo. We use this information to verify your sign-in, establish or link your Papercliped account with your confirmation, protect your session and help you manage sign-in methods. We do not use Google Sign-In to read your Gmail, Google Drive, contacts or calendar. We request only the identity scopes needed for sign-in (normally openid, email and profile); any future Google API permissions would require updated disclosures and applicable consent.
- **Paperclip and MCP connections.** Addresses of Paperclip installations that you connect, linked Paperclip user IDs, your chosen AI application, grant scopes, and connection credentials or references needed to act on your instructions. Sensitive connection credentials are protected in storage. The underlying Paperclip token can carry broad authority; see [Security](/docs/security) and choose access levels carefully.
- **Devices and managed connectivity.** If you use Connect, we process registered device identifiers, ownership and authorized-user relationships, device public keys, pairing events, assigned hostnames, tunnel/provisioning identifiers and connection status. Your device's private signing key stays on the device. The hosted account alone does not grant Proxmox administrator permissions.
- **Billing.** If you purchase Connect, our payment provider processes payment details. We may retain the billing customer identifier, subscription/plan, device quantity, payment and entitlement status, invoice references, and related billing and audit events. We do not need your full card number to manage a subscription.
- **Operational and security information.** We may record IP address, browser or user-agent information, timestamps, login attempts, session and authorization events, request outcomes, tool names, connection hostnames, errors, performance metrics and rate-limit information for security, support, abuse prevention and reliability.
- **Information you send to support.** The contents of your requests, email address and any diagnostics you choose to provide.

## How we use information

We use the information described above to provide sign-in and account recovery; enforce permissions; operate the MCP gateway and optional device connections; complete transactions and apply subscription entitlements; detect abuse; investigate failures; respond to support requests; and comply with applicable legal obligations.

When you authorize an AI client, the gateway transmits relevant requests to your connected Paperclip and returns the results to that client. Responses may contain sensitive task, agent or business information from your installation. The gateway is designed to avoid persistently storing request arguments or full tool responses, but the AI application and your own Paperclip installation may independently keep their own records. Review their privacy notices before connecting.

We do not sell personal data or use Google Sign-In information to target advertisements or train AI models. If we materially change the permitted uses of Google data, we will update this policy and obtain any consent required before using that data differently.

## Who processes or receives information

Depending on which feature you use, information can be processed by:

- **Supabase:** authentication, identity records and PostgreSQL storage.
- **Google:** authentication when you choose Google Sign-In; Google handles your Google account and authentication ceremony.
- **Render:** hosting the Papercliped MCP gateway.
- **Cloudflare:** website delivery, security, DNS and, if you subscribe to Connect, managed tunnels and routing.
- **Stripe:** checkout, billing, payment processing and subscription administration.
- **Resend or another configured email-delivery provider:** sending verification messages and service emails.
- **Your chosen AI application provider:** data you specifically authorize the MCP gateway to deliver to that application.
- **Your own device, hosting or Paperclip provider:** data processed by software you install or independently operate.

We may also disclose limited information when reasonably necessary to investigate fraud, protect users and services, comply with law, or respond to a valid legal request. Providers may process data in different countries under their own applicable safeguards and terms.

## Sessions, cookies and analytics

Hosted account access uses security-related session cookies, including a Secure, HttpOnly browser session used by the Connect API. Cookies and similar browser storage may also remember preferences such as the site's appearance. We use service logs and aggregated metrics to understand reliability and abuse. The marketing site does not intentionally install third-party behavioral-advertising trackers. An IP address or other personal information can nonetheless appear in infrastructure and security logs.

## Retention and deletion

Different records have different lifetimes. For example, short-lived authentication codes expire quickly, while account records remain while you maintain an account. The MCP gateway's operational activity log has historically been configured for about 30 days; additional security, device-provisioning, billing and service-provider logs may have different retention periods. Financial records and some audit records may need to be kept to satisfy legal or security obligations. Disconnecting a tool or tunnel does not necessarily erase past billing or audit records.

To request account access, correction, export or deletion, contact {{CONTACT}}. We will verify the request, explain what can be removed, and handle it under applicable law and technical constraints. You can also revoke AI application grants, remove supported device connections, and manage sessions from the available account interfaces. Revoking Google access in your Google Account can stop future Google authorization, but it does not by itself remove your Papercliped account or records already lawfully retained.

## Security

We use measures such as TLS, access controls, hashed tokens, encryption for certain stored connection credentials, and device-bound signing for supported pairing flows. No internet-connected system is completely secure. Keep your credentials private and use only trusted AI clients, device administrators and connected services.

## Age and location

The hosted service is not intended for children under 18. Privacy rights and protections may vary by location. Contact {{CONTACT}} if you have a privacy question or wish to exercise a right available to you under applicable law.

## Changes and contact

We may revise this policy when services, providers, legal requirements or our handling of information change. Material changes will be communicated where required. The effective date above indicates the version displayed on this page.

**Questions or privacy requests:** {{CONTACT}}.
