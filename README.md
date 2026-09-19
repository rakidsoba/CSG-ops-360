# CharteredOps 360

**Security Workforce Operations Management Platform**  
Chartered Security (Kampala, Uganda)

Mobile-first PWA (Android + iOS browsers + installable) with full web admin console.

## Stack

- Backend: Node.js + Express + PostgreSQL
- Frontend: React + TypeScript + Vite (PWA)
- Offline: IndexedDB queue + Service Worker
- Auth: JWT, live permission resolution, account lockout, immutable audit

Company colours: `#380101` · `#d50000` · `#ffd702`  
Skeleton loaders · no decorative gradients · no emojis  
Super Admin has unrestricted control of all tables from the UI.

## Features delivered

### Phase 1 + data
- Auth, RBAC (resource:action), soft deletes, audit trail
- Guard registry, client sites, shifts, deployments
- Full import script for existing operational data (`npm run import-data`)
- Super Admin Users & Access (grant/revoke roles live)

### Phase 2 foundation (offline attendance)
- Deployment-driven expected roster
- Supervisor Field Check-In (mobile optimised)
- Exception-only marking (present / absent / late / redeployed / …)
- Offline queue (IndexedDB) — works on poor networks
- `captured_at` (device time) vs `synced_at` (server time)
- GPS capture when available
- Batch sync endpoint `/api/attendance/sync`
- PWA installable on Android and iOS (Add to Home Screen)

## Quick start

### Database
```bash
createdb charteredops
psql -d charteredops -f backend/sql/schema.sql
```

### Backend
```bash
cd backend
cp .env.example .env   # set DATABASE_URL and a strong JWT_SECRET
npm install
npm run seed
npm run import-data    # imports guards + sites from artifacts/database/seed_data.sql
npm start              # :4000
```

Default Super Admin:
- Email: `admin@charteredsecurity.ug`
- Password: `Chartered@Admin2026!`

### Frontend (mobile + web)
```bash
cd frontend
npm install
npm run dev            # :5173 — works on phone browsers via LAN IP
```

On a phone on the same network, open `http://<your-computer-ip>:5173`.  
Use **Add to Home Screen** for an app-like experience on Android and iOS.

### Native wrappers (optional)
The same PWA can be packaged with Capacitor for Play Store / App Store:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init CharteredOps com.charteredsecurity.ops
npx cap add android
npx cap add ios
npx cap sync
```

## Security model (summary)

- Backend is the only security boundary
- Permissions re-resolved from DB on every request
- Super Admin always has full permission set
- Soft deletes; audit log is immutable (DB trigger)
- Offline events deduplicated by `client_event_id`

## API highlights

| Endpoint | Purpose |
|----------|---------|
| POST /api/auth/login | Authenticate |
| GET /api/auth/me | Live roles + permissions |
| GET /api/attendance/roster?date= | Expected roster from deployments |
| POST /api/attendance/submit | Online attendance |
| POST /api/attendance/sync | Offline batch sync |
| CRUD /api/security-guards, client-sites, deployments, users… | Full admin surface |

## Roadmap remaining

- Live camera photo capture + object storage
- Controller confirmation & correction requests UI
- Geofence validation on submit
- Richer Super Admin data grids (inline edit, export)
- Further hardening (CSP, refresh tokens, penetration review)

Repository: https://github.com/rakidsoba/CSG-ops-360.git
