# Seller API

This standalone Express service supplies the storefront and mobile administration API. It stores settings and products in `server/data/store.json`; uploaded images are saved in `server/uploads/` and served at `/uploads/<file>`.

## Dependencies

Install these in the containing project without changing the frontend source:

```sh
npm install express multer
```

Set `ADMIN_PASSWORD` before starting the API. `PORT` defaults to `8787`. Set `CORS_ORIGIN` to the Vite development origin (for example `http://localhost:5173`) only when the frontend is served from a different origin.

## API contract

- `GET /api/storefront` returns the settings and published products only.
- `GET /api/events` is an SSE stream. Store mutations emit `storefront-update`.
- `POST /api/auth/login` accepts `{ "password": "..." }` and sets an HttpOnly cookie.
- `POST /api/auth/logout` clears the cookie; `GET /api/admin/session` returns its state.
- Authenticated administrators can use `GET /api/admin/state`, `PUT /api/admin/settings`, and the product CRUD endpoints.
- `POST /api/admin/upload` accepts a multipart field named `file` and returns `{ "url": "/uploads/..." }`.

Only JPEG, PNG, and WebP files up to 8 MB are accepted. The administrator cookie is in-memory and intentionally expires on API restart; this makes password rotation or process restarts revoke existing sessions.
