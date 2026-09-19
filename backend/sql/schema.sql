-- CharteredOps 360 — Production Schema
-- Phase 1 Foundation + strong security model
-- PostgreSQL 16

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ROLES
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(50) NOT NULL UNIQUE,
    description     TEXT,
    is_system       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PERMISSIONS (resource:action pattern)
-- ============================================================
CREATE TABLE IF NOT EXISTS permissions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            VARCHAR(60) NOT NULL UNIQUE,  -- e.g. guards:create
    description     TEXT,
    resource        VARCHAR(40) NOT NULL,
    action          VARCHAR(20) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    full_name       VARCHAR(150) NOT NULL,
    phone           VARCHAR(30),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ,
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- ============================================================
-- USER_ROLES (many-to-many)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_roles (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_by      UUID REFERENCES users(id),
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

-- ============================================================
-- ROLE_PERMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id   UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- ============================================================
-- SECURITY_GUARDS
-- ============================================================
CREATE TABLE IF NOT EXISTS security_guards (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guard_number    VARCHAR(30) NOT NULL UNIQUE,
    full_name       VARCHAR(150) NOT NULL,
    phone           VARCHAR(30),
    pin_hash        TEXT,                    -- for field PIN confirmation
    status          VARCHAR(20) NOT NULL DEFAULT 'Active'
                    CHECK (status IN ('Active', 'Former', 'Suspended')),
    hired_at        DATE,
    separated_at    DATE,
    separation_reason TEXT,
    residential_location TEXT,
    date_of_birth   DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guards_status ON security_guards(status);
CREATE INDEX IF NOT EXISTS idx_guards_number ON security_guards(guard_number);

-- ============================================================
-- CLIENT_SITES
-- ============================================================
CREATE TABLE IF NOT EXISTS client_sites (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_code       VARCHAR(80) NOT NULL UNIQUE,
    name            VARCHAR(200) NOT NULL,
    client_name     VARCHAR(200),
    address         TEXT,
    latitude        DECIMAL(10, 7),
    longitude       DECIMAL(10, 7),
    geofence_radius INTEGER NOT NULL DEFAULT 150,  -- meters
    operational_status VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (operational_status IN ('active', 'inactive', 'suspended')),
    required_visit_frequency VARCHAR(30) DEFAULT 'daily',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sites_status ON client_sites(operational_status);
CREATE INDEX IF NOT EXISTS idx_sites_code ON client_sites(site_code);

-- ============================================================
-- SHIFTS
-- ============================================================
CREATE TABLE IF NOT EXISTS shifts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type            VARCHAR(20) NOT NULL UNIQUE,  -- Day / Night
    name            VARCHAR(50) NOT NULL,
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DEPLOYMENTS (source of truth for expected roster)
-- ============================================================
CREATE TABLE IF NOT EXISTS deployments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guard_id        UUID NOT NULL REFERENCES security_guards(id),
    site_id         UUID NOT NULL REFERENCES client_sites(id),
    shift_id        UUID NOT NULL REFERENCES shifts(id),
    supervisor_id   UUID REFERENCES users(id),
    effective_from  DATE NOT NULL,
    effective_to    DATE,
    active          BOOLEAN NOT NULL DEFAULT true,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployments_guard ON deployments(guard_id);
CREATE INDEX IF NOT EXISTS idx_deployments_site ON deployments(site_id);
CREATE INDEX IF NOT EXISTS idx_deployments_active ON deployments(active);
CREATE INDEX IF NOT EXISTS idx_deployments_dates ON deployments(effective_from, effective_to);

-- ============================================================
-- AUDIT_LOGS (append-only, immutable)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(50) NOT NULL,       -- CREATE, UPDATE, DEACTIVATE, GRANT_ROLE, REVOKE_ROLE, LOGIN, LOGIN_FAILED
    entity_type     VARCHAR(50) NOT NULL,
    entity_id       UUID,
    old_value       JSONB,
    new_value       JSONB,
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- Prevent any updates/deletes on audit_logs via application (enforced in code + optional trigger)
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_no_update ON audit_logs;
CREATE TRIGGER audit_no_update
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

-- ============================================================
-- REFRESH TOKENS (for stronger session control - optional rotation)
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

