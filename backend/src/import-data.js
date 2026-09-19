/**
 * Full data import from the original Chartered seed_data.sql
 * Maps old table names/columns → current architecture schema.
 * Run after: schema.sql + npm run seed
 *
 * Usage: node src/import-data.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./config/db');

const SEED_PATH = path.resolve(__dirname, '../../../database/seed_data.sql');

function extractInserts(sql, tableName) {
  const re = new RegExp(
    `INSERT INTO ${tableName}\\s*\\(([^)]+)\\)\\s*VALUES\\s*\\(([^;]+)\\)`,
    'gi'
  );
  const rows = [];
  let m;
  while ((m = re.exec(sql)) !== null) {
    const cols = m[1].split(',').map((c) => c.trim().toLowerCase());
    // naive value split respecting simple quotes
    const vals = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < m[2].length; i++) {
      const ch = m[2][i];
      if (ch === "'" && m[2][i - 1] !== '\\') inQuote = !inQuote;
      if (ch === ',' && !inQuote) {
        vals.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) vals.push(cur.trim());
    const obj = {};
    cols.forEach((c, i) => {
      let v = vals[i] || 'NULL';
      if (v.toUpperCase() === 'NULL') v = null;
      else if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1).replace(/''/g, "'");
      obj[c] = v;
    });
    rows.push(obj);
  }
  return rows;
}

async function importGuards(sql) {
  // Original table is "guards"
  const rows = extractInserts(sql, 'guards');
  console.log(`Parsed ${rows.length} guards`);
  let inserted = 0;
  for (const r of rows) {
    const status = (r.employment_status || 'Active').trim();
    const mappedStatus = status === 'Former' ? 'Former' : 'Active';
    try {
      await db.query(
        `INSERT INTO security_guards
          (guard_number, full_name, phone, status, hired_at, separated_at, separation_reason, residential_location, date_of_birth)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (guard_number) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           phone = COALESCE(EXCLUDED.phone, security_guards.phone),
           status = EXCLUDED.status,
           hired_at = COALESCE(EXCLUDED.hired_at, security_guards.hired_at),
           residential_location = COALESCE(EXCLUDED.residential_location, security_guards.residential_location),
           date_of_birth = COALESCE(EXCLUDED.date_of_birth, security_guards.date_of_birth),
           updated_at = NOW()`,
        [
          r.guard_number,
          r.full_name,
          r.phone || null,
          mappedStatus,
          r.date_joined || null,
          r.exit_date || null,
          r.exit_reason || null,
          r.residential_location || null,
          r.dob || null,
        ]
      );
      inserted++;
    } catch (err) {
      console.error('Guard import error', r.guard_number, err.message);
    }
  }
  console.log(`Guards imported/updated: ${inserted}`);
}

async function importSites(sql) {
  const rows = extractInserts(sql, 'client_sites');
  console.log(`Parsed ${rows.length} client sites`);
  let inserted = 0;
  for (const r of rows) {
    const status = (r.status || 'active').toLowerCase() === 'active' ? 'active' : 'inactive';
    try {
      await db.query(
        `INSERT INTO client_sites
          (site_code, name, client_name, operational_status, geofence_radius, required_visit_frequency)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (site_code) DO UPDATE SET
           name = EXCLUDED.name,
           client_name = COALESCE(EXCLUDED.client_name, client_sites.client_name),
           operational_status = EXCLUDED.operational_status,
           geofence_radius = COALESCE(EXCLUDED.geofence_radius, client_sites.geofence_radius),
           updated_at = NOW()`,
        [
          r.site_code,
          r.name,
          r.client_name || r.name,
          status,
          parseInt(r.geofence_radius_m || r.geofence_radius || '150', 10) || 150,
          r.required_visit_frequency || 'daily',
        ]
      );
      inserted++;
    } catch (err) {
      console.error('Site import error', r.site_code, err.message);
    }
  }
  console.log(`Sites imported/updated: ${inserted}`);
}

async function main() {
  if (!fs.existsSync(SEED_PATH)) {
    console.error('Seed file not found at', SEED_PATH);
    console.error('Place the original seed_data.sql under artifacts/database/');
    process.exit(1);
  }
  const sql = fs.readFileSync(SEED_PATH, 'utf8');
  console.log('Starting full data import...');
  await importGuards(sql);
  await importSites(sql);

  // Optional: create a few sample deployments if none exist
  const depCount = await db.query(`SELECT COUNT(*)::int AS c FROM deployments`);
  if (depCount.rows[0].c === 0) {
    console.log('Creating sample deployments from first active guards + sites...');
    const guards = await db.query(`SELECT id FROM security_guards WHERE status = 'Active' LIMIT 20`);
    const sites = await db.query(`SELECT id FROM client_sites WHERE operational_status = 'active' LIMIT 10`);
    const shifts = await db.query(`SELECT id FROM shifts`);
    if (guards.rows.length && sites.rows.length && shifts.rows.length) {
      let i = 0;
      for (const g of guards.rows) {
        const site = sites.rows[i % sites.rows.length];
        const shift = shifts.rows[i % shifts.rows.length];
        await db.query(
          `INSERT INTO deployments (guard_id, site_id, shift_id, effective_from, active)
           VALUES ($1,$2,$3, CURRENT_DATE - 7, true)
           ON CONFLICT DO NOTHING`,
          [g.id, site.id, shift.id]
        );
        i++;
      }
      console.log(`Sample deployments created: ${i}`);
    }
  }

  const summary = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM security_guards) AS guards,
      (SELECT COUNT(*) FROM client_sites) AS sites,
      (SELECT COUNT(*) FROM deployments WHERE active) AS active_deployments,
      (SELECT COUNT(*) FROM users) AS users
  `);
  console.log('Import complete. Counts:', summary.rows[0]);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
