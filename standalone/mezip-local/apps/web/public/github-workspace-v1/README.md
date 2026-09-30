# ME.zip GitHub Developer Workspace v1

This is an independently addressable GitHub workspace UI. It does not modify
or replace `/post-login-app/index.html`.

## Local URLs

- Real/fail-closed surface: `http://127.0.0.1:5174/github-workspace-v1/index.html`
- Explicit UI-only preview: `http://127.0.0.1:5174/github-workspace-v1/index.html?preview=1#overview`
- Official GitHub: `https://github.com/`

The preview flag is accepted only on `127.0.0.1` or `localhost` and always
labels its data as non-GitHub layout fixtures. Without that explicit flag, a
missing API produces a visible configuration error and no fake connection.

## Server contract

The static client calls the existing-origin routes implemented by
`@me-zip/github-workspace`:

- `GET /api/integrations/github/connect`
- `GET /api/integrations/github/callback`
- `GET /v1/github-workspace/connection`
- `POST /v1/github-workspace/sync`
- `GET /v1/github-workspace/{overview,repositories,snippets,issues,tasks,activity}`
- `PATCH /v1/github-workspace/tasks/:id`

OAuth codes, GitHub access tokens, App private keys and webhook secrets are
server-only. The client does not use `localStorage`, cookies or browser session
inspection to acquire GitHub credentials.

## Production human actions

1. Create and review a GitHub App under the intended GitHub account.
2. Configure the exact callback URL and minimum repository permissions.
3. Provision a production KMS/secrets vault and the encrypted Postgres state
   adapter.
4. Apply migration 022 and rehearse the trusted service role with FORCE RLS.
5. Install the GitHub App on selected repositories and complete an authorized
   sync smoke test.

Until those steps are performed, production connection and sync remain
`PENDING HUMAN ACTION`; the UI must remain fail-closed.
