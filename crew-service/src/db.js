// Database connection for Crew Service.
// Only this service has the key (DATABASE_URL) to crews_db.

const { Pool, types } = require('pg');

// Return DATE columns as plain 'YYYY-MM-DD' strings. By default pg turns them into
// JavaScript Date objects, which can shift by a day depending on the timezone.
types.setTypeParser(types.builtins.DATE, (value) => value);

// A pool keeps a few connections open and reuses them, instead of connecting on every request.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://crew_user:crew_pass@localhost:5432/crews_db',
});

// Creates this service's tables if they don't exist yet. Runs on every startup; safe to repeat.
async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workers (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      first_name  TEXT NOT NULL,
      last_name   TEXT NOT NULL,
      phone       TEXT,
      trade       TEXT NOT NULL CHECK (trade IN ('framing', 'concrete', 'electrical', 'plumbing', 'roofing', 'drywall')),
      role        TEXT NOT NULL DEFAULT 'worker' CHECK (role IN ('lead', 'worker', 'apprentice')),
      active      BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      -- Same service, same database: the database itself guarantees the worker exists.
      worker_id     UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      -- No REFERENCES here: projects live in Project Service's database, which we can't see.
      -- That's why the code asks Project Service over HTTP before saving.
      project_id    UUID NOT NULL,
      project_name  TEXT NOT NULL,
      start_date    DATE NOT NULL,
      end_date      DATE
    );

    -- A worker can't be actively assigned to the same project twice
    -- (but can be on several different projects).
    CREATE UNIQUE INDEX IF NOT EXISTS assignments_one_active_per_worker_project
      ON assignments (worker_id, project_id) WHERE end_date IS NULL;

    CREATE INDEX IF NOT EXISTS assignments_project_id ON assignments (project_id);
  `);
}

module.exports = { pool, migrate };
