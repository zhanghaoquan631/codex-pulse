# GitHub Workspace V4

Open `http://127.0.0.1:5174/github-workspace-v4/index.html` after completing
the official GitHub OAuth flow. This is a separate versioned entry point; V3
remains available unchanged.

V4 removes preview mode, automatically performs the first real synchronization
after OAuth callback, and then exposes the existing read-only API views:
overview, repositories and repository details, snippets, Issues, Pull Requests,
activity, and the Issue/PR task board. It has no fixture fallback.

Repository visibility/name/stars filters, snippet language/source filters, and
Issue state/repository filters are wired in this V4 surface; task movement,
favorite, copy, repository detail, and retry actions remain available.
