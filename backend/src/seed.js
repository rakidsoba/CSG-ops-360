/**
 * CharteredOps 360 — Seed
 * Creates roles, permissions (resource:action), baseline matrix, shifts,
 * Super Admin account, and imports operational data when available.
 */
require('dotenv').config();
const db = require('./config/db');
const { hashPassword } = require('./utils/password');

const RESOURCES = ['users', 'roles', 'permissions', 'guards', 'sites', 'shifts', 'deployments', 'audit'];
const ACTIONS = ['read', 'create', 'update', 'delete'];

const ROLE_MATRIX = {
  'Super Admin': RESOURCES.flatMap((r) => ACTIONS.map((a) => `${r}:${a}`)),
  'Director': ['guards:read', 'sites:read', 'shifts:read', 'deployments:read', 'users:read', 'roles:read', 'audit:read'],
  'HR': ['guards:read', 'guards:create', 'guards:update', 'guards:delete', 'sites:read', 'shifts:read'],
  'Operations Officer': ['guards:read', 'sites:read', 'sites:update', 'shifts:read', 'deployments:read'],
  'Controller': ['guards:read', 'sites:read', 'shifts:read', 'deployments:read', 'deployments:update', 'audit:read'],
  'Supervisor': ['guards:read', 'sites:read', 'shifts:read', 'deployments:read'],
};

async function seed() {
  console.log('Seeding CharteredOps 360...');

  // Roles
  for (const name of Object.keys(ROLE_MATRIX)) {
    await db.query(
      `INSERT INTO roles (name, description, is_system)
       VALUES ($1, $2, true)
       ON CONFLICT (name) DO NOTHING`,
      [name, `${name} role`]
    );
  }
  console.log('Roles ready');

  // Permissions
  for (const resource of RESOURCES) {
    for (const action of ACTIONS) {
      const code = `${resource}:${action}`;
      await db.query(
        `INSERT INTO permissions (code, description, resource, action)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO NOTHING`,
        [code, `${action} ${resource}`, resource, action]
      );
    }
  }
  console.log('Permissions ready');

  // Role → Permission matrix
  for (const [roleName, codes] of Object.entries(ROLE_MATRIX)) {
    const roleRes = await db.query(`SELECT id FROM roles WHERE name = $1`, [roleName]);
    if (!roleRes.rows.length) continue;
    const roleId = roleRes.rows[0].id;
    for (const code of codes) {
      const pRes = await db.query(`SELECT id FROM permissions WHERE code = $1`, [code]);
      if (pRes.rows.length) {
        await db.query(
          `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [roleId, pRes.rows[0].id]
        );
      }
    }
  }
  console.log('Role matrix ready');

  // Shifts
  await db.query(
    `INSERT INTO shifts (type, name, start_time, end_time, description)
     VALUES
       ('Day', 'Day Shift', '06:00', '18:00', 'Standard day shift 06:00–18:00'),
       ('Night', 'Night Shift', '18:00', '06:00', 'Standard night shift 18:00–06:00')
     ON CONFLICT (type) DO NOTHING`
  );
  console.log('Shifts ready');

  // Super Admin user
  const adminEmail = 'admin@charteredsecurity.ug';
  const adminPass = 'Chartered@Admin2026!';
  const hash = await hashPassword(adminPass);
  const userRes = await db.query(
    `INSERT INTO users (email, password_hash, full_name, phone, is_active)
     VALUES ($1, $2, 'System Super Admin', '+256700000000', true)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = true
     RETURNING id`,
    [adminEmail, hash]
  );
  const adminId = userRes.rows[0].id;
  const saRole = await db.query(`SELECT id FROM roles WHERE name = 'Super Admin'`);
  if (saRole.rows.length) {
    await db.query(
      `INSERT INTO user_roles (user_id, role_id, granted_by) VALUES ($1,$2,$1) ON CONFLICT DO NOTHING`,
      [adminId, saRole.rows[0].id]
    );
  }
  console.log('Super Admin ready:', adminEmail, '/', adminPass);

  // Optional: minimal demo data if tables empty
  const guardCount = await db.query(`SELECT COUNT(*)::int AS c FROM security_guards`);
  if (guardCount.rows[0].c === 0) {
    console.log('Inserting sample guards and sites for demo...');
    await db.query(`
      INSERT INTO security_guards (guard_number, full_name, phone, status, hired_at) VALUES
      ('CSG001', 'Demo Guard One', '0700000001', 'Active', '2024-01-15'),
      ('CSG002', 'Demo Guard Two', '0700000002', 'Active', '2024-03-20'),
      ('CSG003', 'Demo Guard Three', '0700000003', 'Active', '2025-06-01')
      ON CONFLICT DO NOTHING
    `);
    await db.query(`
      INSERT INTO client_sites (site_code, name, client_name, operational_status, geofence_radius) VALUES
      ('SITE001', 'Kampala HQ', 'Chartered Security', 'active', 150),
      ('SITE002', 'Entebbe Warehouse', 'LogiCorp', 'active', 200)
      ON CONFLICT DO NOTHING
    `);
  }

  console.log('Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
