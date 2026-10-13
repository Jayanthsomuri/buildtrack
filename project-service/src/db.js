// Database connection for Project Service.
// Only this service has the key (DATABASE_URL) to projects_db.

const { Pool, types } = require('pg');

// Return DATE columns as plain 'YYYY-MM-DD' strings. By default pg turns them into
// JavaScript Date objects, which can shift by a day depending on the timezone.
types.setTypeParser(types.builtins.DATE, (value) => value);

// A pool keeps a few connections open and reuses them, instead of connecting on every request.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://project_user:project_pass@localhost:5432/projects_db',
});

// Creates this service's tables if they don't exist yet. Runs on every startup; safe to repeat.
async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT NOT NULL,
      street      TEXT NOT NULL,
      city        TEXT NOT NULL,
      state       TEXT NOT NULL,
      zip         TEXT NOT NULL,
      community   TEXT,
      lot_number  TEXT,
      latitude    DOUBLE PRECISION,
      longitude   DOUBLE PRECISION,
      home_type   TEXT NOT NULL CHECK (home_type IN ('single-family', 'two-story', 'ranch', 'townhome', 'condo')),
      deadline    DATE NOT NULL,
      status      TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'in-progress', 'completed', 'on-hold')),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Our COPY of who is currently working on each project, kept up to date from Crew Service's
    -- "crew-events". Crew Service owns the real data; we never edit this from the API.
    -- One row per active assignment, so replaying an event can't count anyone twice.
    CREATE TABLE IF NOT EXISTS project_crew (
      assignment_id  UUID PRIMARY KEY,
      -- Deleting a project removes its crew copy too.
      project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      worker_id      UUID NOT NULL,
      worker_name    TEXT NOT NULL,
      trade          TEXT NOT NULL,
      start_date     DATE NOT NULL
    );

    CREATE INDEX IF NOT EXISTS project_crew_project_id ON project_crew (project_id);
    CREATE INDEX IF NOT EXISTS project_crew_worker_id ON project_crew (worker_id);
  `);
}

module.exports = { pool, migrate };
