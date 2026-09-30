# Edge official account recording

The owner asked for automatic account records with minimal repeated steps. Use only the official Browser tools on this computer. The webpage cannot directly read ChatGPT's Edge cookies or detect global login/logout events.

## Authorization and access

Only these complete emails are authorized: account2@example.com, account3@example.com, account4@example.com, account5@example.com, account7@example.com, account6@example.com. Excluded profiles 我我 and 小光 must not be opened or inspected.

Read the current task AGENTS.md and outputs/账号查询索引.md first. Reuse the existing collector configuration at C:/Users/your-user/Documents/Codex/2026-09-11/ai/outputs/codex-pulse/collector/config.json in memory. It authorizes only this existing Site's ingest endpoint. Never print the file, its secrets, proxy values, credentials, cookies or browser tokens.

The client collector/account-query-client.mjs offers status, claim and finish. Run it with the existing Windows proxy inherited via process-utils.ps1 and Node --use-env-proxy. Pass the configuration path as the second positional argument. For finish, pass a private receipt JSON file path; credentials are not in receipts. Remove transient receipt files after the response is verified. Keep permanent official evidence records free of credentials.

## Each run

1. Read /api/ingest/account-query with the existing collector credential. It supplies private locator hints and queued requests; website /api/accounts/evidence remains owner-only. Claim one request using POST action claim. If no request, end quietly. A lease lasts four minutes. Process pending manual requests first; scheduled requests mean inspect the account currently logged into Edge, never the Codex desktop identity.
2. Select the connected Edge browser using official tools. Prefer a verified locator extension instance/tab hint, but obtain a fresh current inventory. Never treat browser/profile/tab/Google identity as account proof. If connection fails, follow official Browser diagnostics, never use shell/CDP/cookie extraction as substitute.
3. On the same official ChatGPT session, open the account page and read the visible full email. If requested email is set, it must match exactly. For current-account requests the email must be in the six-account allowlist. Do not log out, switch accounts, or log into other accounts to satisfy a pending request.
4. Read official usage: plan, five-hour and weekly used percentages, reset times if visible, balance if visible, reset-card count (zero only if actually shown), each card's status/type/expiry original text, and grant/redeem history. Read official billing in the same Edge session: renewalDate and autoRenew for an explicit renewal, or periodEndDate and autoRenew=false for an explicit subscription-end date. Preserve date-only values without fabricated midnight. Do not buy, bind payment methods, spend reset cards, or cancel subscriptions.
5. Re-read the full email on the same official account page after collection. Any account change invalidates the complete capture.
6. Submit action finish, id, leaseToken, verifiedEmailAfter, and evidence. Evidence is the existing strict ingest shape: email, verifiedEmail, observedAt (actual current UTC time), source official-page, locator browser edge plus verified tab/extension hints, and only fields actually read this run. Complete requires planType, windows, resetCredits, resetHistory and billing. Partial results preserve previous fields and their original timestamps. Do not copy old snapshots into new evidence.
7. For a blocker submit only id, leaseToken, error: connection_required | login_required | account_mismatch | account_changed | page_unavailable. No free-form error dumps or passwords. Failed queries preserve all old data. Late/reclaimed leases return 409; do not resend as a new successful query.
8. Read state and the Site snapshot back. Match receipt to the claimed query, complete email, field timestamps and immutable history. A successful writer response alone does not prove a real website capture. Only report verified changes or a new user action requirement; stay quiet for unchanged data and repeated known blockers.

## Scheduling and limitations

This is a local Codex heartbeat, dependent on this computer, Codex and Edge connection. Scheduled checks every five minutes detect sign-in/account changes on the next successful check; they are not login/logout callbacks and cannot promise a final read immediately before logout. Site polling only displays saved data/status. Keep the heartbeat paused until the actual Edge source and authenticated writer are verified; after both pass, update the existing a147 heartbeat rather than creating duplicates.

