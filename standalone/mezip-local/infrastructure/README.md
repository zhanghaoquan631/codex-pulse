# Infrastructure Boundary

Phase 0 creates no cloud account, database instance, payment configuration, object-storage
bucket, DNS record, or production secret. It documents the needed topology and keeps local
safe placeholders in `.env.example`.

When infrastructure begins, each environment receives isolated identity, PostgreSQL,
object-storage, cache/queue, secrets, monitoring, and feature-flag configuration. Production
access is least-privilege, audited, and never used for normal development.
