# Prototype Instructions

## Owner requirements (2026-09-19)

- Public customer store and mobile/desktop management are separate URL entry points to the same data.
- Owner QQ: YOUR_QQ. Use the exact user-provided WeChat and Alipay payment images.
- Backup QQ: YOUR_BACKUP_QQ. Keep the primary number and offer this alternative if it cannot be contacted; show it in the announcement, customer-service dialog, home contact card and shared product contact blocks.
- Owner explicitly requested public access for customers and mobile purchasing on 2026-09-19. Keep management password-protected. After learning personal QR codes cannot enforce an exact transfer amount, the owner withdrew the amount-lock requirement; preserve personal QR/manual receipt verification.
- Preserve reference site's purchase and delivery explanation wording. It is a shared template automatically shown on every product; the owner must not re-enter it.
- Admin only needs product images, product copy, and price to publish. Descriptions are product content, not replacements for the shared purchase instructions.
- Actual fulfillment is manual. Customer payment submission does not confirm payment. Owner privately contacts customers and can manually mark orders paid/processed; never automatically send cards or activate subscriptions.
- The owner confirmed permission to reuse the original product images and wording on 2026-09-19.
- Implement https://0xzheng.com/ as the storefront home, including its announcement, category sidebar and catalog; product details remain separate routes. New admin-published products must appear on this home.
- On 2026-09-19 the owner supplied a final seven-rule 下单须知 and explicitly requested adding it to the announcement and automatically showing it on entry to each product purchase page. Use the latest wording (no USDT-only restriction and no ticket link); retain the supplied registration/OKX wording as copy only, without adding those capabilities or changing payment methods. Keep the original announcement/contact content and product delivery template. Product-entry reminders must not be suppressed by homepage acknowledgement or reopen during data refresh/payment.
- Keep the Codex reset calendar. On 2026-09-19 the owner explicitly said to stop pursuing email and sending-service setup ("不要管那个邮箱和发信方案了"); email integration is no longer a completion requirement. Leave the currently disabled subscription controls unchanged unless the owner asks otherwise. Do not ask again about SMTP, Resend, or mail hosting, enable mail, or modify the existing booking system or its credentials.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
