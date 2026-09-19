# CharteredOps 360

**Security Workforce Operations Management Platform**  
Chartered Security (Kampala, Uganda)

Mobile-first PWA (Android + iOS + web). Company colours `#380101` · `#d50000` · `#ffd702`. Skeleton loaders. Super Admin has full table control from the UI.

## What is included

### Foundation
- JWT auth, live permission resolution, account lockout, immutable audit
- Guards, sites, shifts, deployments, users, roles
- Full data import from operational seed (`npm run import-data`)

### Field attendance (Phase 2)
- Deployment-driven roster
- Exception-only check-in (mobile optimised)
- **Live camera only** (no gallery) → stored as file metadata, binary on disk
- GPS + **geofence enforcement** when site coordinates exist
- Offline IndexedDB queue + sync (`captured_at` vs `synced_at`)
- Controller **confirm/lock** and **correction request / approve / reject**

### Admin
- Richer Guards grid: search, status filter, inline edit, CSV export
- Users & Access: grant/revoke roles live
- Attendance Review screen for Controllers

### Hardening
- Helmet (CSP in production), rate-limited login, soft deletes
- Geofence unit tests (`npm test`)
- Photo size/type limits; audit on uploads

## Quick start

```bash
# DB
createdb charteredops
psql -d charteredops -f backend/sql/schema.sql

# Backend
cd backend
cp .env.example .env
npm install
npm run seed
npm run import-data
npm test
npm start

# Frontend
cd frontend
npm install
npm run dev
```

Super Admin: `admin@charteredsecurity.ug` / `Chartered@Admin2026!`

On phone (same Wi-Fi): open `http://<LAN-IP>:5173` → Add to Home Screen.

Optional native: Capacitor (`npx cap add android|ios`).

## Key API routes

| Method | Path | Notes |
|--------|------|--------|
| POST | /api/auth/login | Public |
| GET | /api/auth/me | Live permissions |
| GET | /api/attendance/roster | Expected roster |
| POST | /api/attendance/submit | Online + geofence |
| POST | /api/attendance/sync | Offline batch |
| POST | /api/attendance/:id/confirm | Controller lock |
| POST | /api/files/photo | Live camera base64 |
| GET/POST | /api/corrections | Request + review |
| CRUD | /api/security-guards etc. | Full admin |

Repository: https://github.com/rakidsoba/CSG-ops-360.git
