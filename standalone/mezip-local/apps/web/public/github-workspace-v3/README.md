# GitHub Workspace V3

This entry point is real-account-only. It never enables the V1 preview adapter,
and it depends on the loopback GitHub App bridge during local development.

It reads repositories, repository contents, Issues and Pull Requests only from
`/v1/github-workspace/*` after the signed local GitHub session is connected.
It has no fixture fallback: loading, empty, authorization and provider-error
states remain explicit, and provider failures expose a retry rather than
synthetic workspace data.

The original `/post-login-app/index.html`, V1 preview and V2 fail-closed page
remain independently viewable and unchanged.
