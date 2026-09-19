# CharteredOps 360

**Security Workforce Operations Management Platform**  
For Chartered Security (Kampala, Uganda)

Production-grade Phase 1 foundation with strong backend-enforced security, permission-gated UI, audit trail, and design system using company colors (#380101, #d50000, #ffd702).

## Architecture

- **Backend**: Node.js + Express + PostgreSQL  
  - JWT authentication (12h), bcrypt (12 rounds)  
  - Permissions re-resolved from database on every request  
  - Account lockout after 5 failed logins  
  - Soft deletes, append-only immutable audit log  
  - Super Admin has unrestricted access to all tables via API and UI  

- **Frontend**: React + TypeScript + Vite  
  - Permission-driven navigation (unpermitted screens are invisible)  
  - Skeleton loaders on all data views  
  - Semantic company colors, no decorative gradients, no emojis  
  - Ready for PWA / offline field capture (Phase 2)

## Quick start

### Prerequisites
- Node.js 18+
- PostgreSQL 16

### Database
```bash
createdb charteredops
psql -d charteredops -f backend/sql/schema.sql
```

### Backend
```bash
cd backend
cp .env.example .env   # edit JWT_SECRET and DATABASE_URL
npm install
npm run seed           # creates roles, permissions, Super Admin
npm start              # port 4000
```

Default Super Admin:
- Email: `admin@charteredsecurity.ug`
- Password: `Chartered@Admin2026!`

### Frontend
```bash
cd frontend
npm install
npm run dev            # port 5173
```

## Security highlights

1. Backend is the sole security boundary. UI hiding is convenience only.
2. Token does not carry permissions; every request reloads roles + permissions from DB.
3. Super Admin bypass is enforced both in permission resolution and in guards.
4. Audit log is append-only (database trigger blocks UPDATE/DELETE).
5. Soft-delete only on operational tables.
6. Rate limiting on login endpoint + account lockout.

## Permission model

Codes follow `resource:action` (e.g. `guards:create`, `deployments:update`).

Roles: Super Admin, Director, HR, Operations Officer, Controller, Supervisor.

Super Admin can grant extra roles to any user from the Users & Access screen; the change is live on the next `/auth/me` call.

## Offline (Phase 2 design)

- Supervisor field app will be a PWA.
- Capture timestamp (`captured_at`) is stored on device; sync timestamp is separate.
- IndexedDB queue for attendance exceptions when offline.
- Deployment record remains the source of truth for expected roster.

## Repository

https://github.com/rakidsoba/CSG-ops-360.git

