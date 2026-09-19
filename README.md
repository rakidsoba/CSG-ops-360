# CharteredOps 360

**Security Workforce Operations Management Platform**  
Chartered Security (Kampala, Uganda)

Mobile-first PWA + Capacitor (Android / iOS). Colours `#380101` · `#d50000` · `#ffd702`.

## Auth — refresh token rotation

- **Access token**: short-lived JWT (`JWT_EXPIRES_IN`, default **15m**), type `access`
- **Refresh token**: opaque random string, stored **hashed** in `refresh_tokens`, default **14 days**
- On `/api/auth/refresh`: old refresh is revoked, new access + refresh issued (rotation)
- Reuse of a revoked refresh token → **all sessions for that user revoked** (theft detection)
- Frontend stores both tokens; on 401 automatically refreshes once (single-flight), then retries

```http
POST /api/auth/login     → { accessToken, refreshToken, expiresIn }
POST /api/auth/refresh   → { accessToken, refreshToken }  body: { refreshToken }
POST /api/auth/logout    → revokes refresh token
```

## Capacitor (native Android / iOS)

Config is in `frontend/capacitor.config.ts`  
App ID: `ug.charteredsecurity.ops360`

```bash
cd frontend
npm install
npm run build
npx cap add android
npx cap add ios
npx cap sync
npx cap open android   # or ios
```

See **frontend/CAPACITOR.md** for permissions (camera, location) and build notes.

## Quick start (web)

```bash
# Database
createdb charteredops
psql -d charteredops -f backend/sql/schema.sql

# Backend
cd backend && cp .env.example .env && npm install
npm run seed && npm run import-data && npm test && npm start

# Frontend
cd frontend && npm install && npm run dev
```

Super Admin: `admin@charteredsecurity.ug` / `Chartered@Admin2026!`

## Feature summary

| Area | Status |
|------|--------|
| RBAC + live permissions | Done |
| Full data import | Done |
| Offline attendance queue | Done |
| Live camera check-in | Done |
| Geofence on submit | Done |
| Controller confirm + corrections | Done |
| Refresh token rotation | Done |
| Capacitor config + docs | Done |

Repository: https://github.com/rakidsoba/CSG-ops-360.git
