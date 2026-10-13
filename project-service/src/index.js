// Project Service
// Owns: construction projects - address, location, home type, deadline, status.
// Doesn't own people - but keeps a read-only copy of who is on each project, fed by Crew Service's
// "crew-events". No other service may read or write this data directly.

const express = require('express');
const { pool, migrate } = require('./db');
const { startEvents, stopEvents, publishProjectEvent, EventBusUnavailableError } = require('./events');

const app = express();
app.use(express.json());
// Express 5 leaves req.body undefined when no JSON was sent; default it to {}.
app.use((req, res, next) => {
  req.body ??= {};
  next();
});

const PORT = process.env.PORT || 3001;

const HOME_TYPES = ['single-family', 'two-story', 'ranch', 'townhome', 'condo'];
const STATUSES = ['planning', 'in-progress', 'completed', 'on-hold'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function validateProject(body) {
  const errors = [];
  const { name, address, homeType, deadline, status = 'planning' } = body;
  if (!name) errors.push('name is required');
  if (!address || !address.street || !address.city || !address.state || !address.zip) {
    errors.push('address.street, address.city, address.state and address.zip are required');
  }
  if (!HOME_TYPES.includes(homeType)) errors.push(`homeType must be one of: ${HOME_TYPES.join(', ')}`);
  if (!isValidDate(deadline)) errors.push('deadline must be a date in YYYY-MM-DD format');
  if (!STATUSES.includes(status)) errors.push(`status must be one of: ${STATUSES.join(', ')}`);
  return errors;
}

// Request body -> query parameters, in the column order used by INSERT and UPDATE below.
function toProjectParams(body) {
  const { name, address, location = {}, homeType, deadline, status = 'planning' } = body;
  return [
    name,
    address.street,
    address.city,
    address.state,
    address.zip,
    location.community ?? null,
    location.lotNumber ?? null,
    location.latitude ?? null,
    location.longitude ?? null,
    homeType,
    deadline,
    status,
  ];
}

// Database row (flat, snake_case) -> API response (nested, camelCase), same shape as before.
function toProject(row) {
  return {
    id: row.id,
    name: row.name,
    address: { street: row.street, city: row.city, state: row.state, zip: row.zip },
    location: {
      community: row.community,
      lotNumber: row.lot_number,
      latitude: row.latitude,
      longitude: row.longitude,
    },
    homeType: row.home_type,
    deadline: row.deadline,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findProject(id) {
  const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
  return rows[0] ? toProject(rows[0]) : null;
}

// Runs work(client) inside a database transaction: everything is saved, or nothing is.
// We publish the Kafka event INSIDE the transaction - if publishing fails, the database
// change is rolled back, so the database and the events never disagree.
async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Ids are UUIDs - anything else can't exist, so answer 404 before it reaches the database.
app.param('id', (req, res, next, id) => {
  if (!UUID_PATTERN.test(id)) return res.status(404).json({ error: 'Project not found' });
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'project-service' });
});

app.post('/projects', async (req, res) => {
  const errors = validateProject(req.body);
  if (errors.length) return res.status(400).json({ errors });

  // $1, $2... are placeholders: values are sent separately from the SQL,
  // so user input can never be run as SQL (prevents "SQL injection").
  const { rows } = await pool.query(
    `INSERT INTO projects (name, street, city, state, zip, community, lot_number, latitude, longitude, home_type, deadline, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    toProjectParams(req.body),
  );
  const project = toProject(rows[0]);

  console.log(`[project-service] Created project ${project.id} (${project.name})`);
  res.status(201).json(project);
});

app.get('/projects', async (req, res) => {
  const { homeType, status, city } = req.query;
  const conditions = [];
  const params = [];
  if (homeType) {
    params.push(homeType);
    conditions.push(`home_type = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (city) {
    params.push(city);
    conditions.push(`LOWER(city) = LOWER($${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(`SELECT * FROM projects ${where} ORDER BY created_at`, params);
  res.json(rows.map(toProject));
});

// Must be registered before /projects/:id, otherwise Express treats "overdue" as an id.
app.get('/projects/overdue', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM projects WHERE deadline < CURRENT_DATE AND status <> 'completed' ORDER BY deadline`,
  );
  res.json(rows.map(toProject));
});

app.get('/projects/:id', async (req, res) => {
  const project = await findProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

// Who is on this project right now - answered from our copy, no call to Crew Service.
// It can lag a moment behind Crew Service (it's updated from events).
app.get('/projects/:id/crew', async (req, res) => {
  const project = await findProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { rows } = await pool.query(
    'SELECT * FROM project_crew WHERE project_id = $1 ORDER BY start_date, worker_name',
    [req.params.id],
  );
  const byTrade = {};
  for (const row of rows) byTrade[row.trade] = (byTrade[row.trade] ?? 0) + 1;

  res.json({
    projectId: project.id,
    projectName: project.name,
    total: rows.length,
    byTrade,
    workers: rows.map((row) => ({
      assignmentId: row.assignment_id,
      workerId: row.worker_id,
      name: row.worker_name,
      trade: row.trade,
      startDate: row.start_date,
    })),
  });
});

app.put('/projects/:id', async (req, res) => {
  const errors = validateProject(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const project = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE projects
       SET name = $1, street = $2, city = $3, state = $4, zip = $5, community = $6, lot_number = $7,
           latitude = $8, longitude = $9, home_type = $10, deadline = $11, status = $12, updated_at = now()
       WHERE id = $13
       RETURNING *`,
      [...toProjectParams(req.body), req.params.id],
    );
    if (!rows[0]) return null;

    const updated = toProject(rows[0]);
    await publishProjectEvent('ProjectUpdated', updated);
    return updated;
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  console.log(`[project-service] Updated project ${project.id}`);
  res.json(project);
});

app.patch('/projects/:id/deadline', async (req, res) => {
  const { deadline } = req.body;
  if (!isValidDate(deadline)) return res.status(400).json({ error: 'deadline must be a date in YYYY-MM-DD format' });

  const project = await withTransaction(async (client) => {
    const { rows } = await client.query(
      'UPDATE projects SET deadline = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [deadline, req.params.id],
    );
    if (!rows[0]) return null;

    const updated = toProject(rows[0]);
    await publishProjectEvent('ProjectUpdated', updated);
    return updated;
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  console.log(`[project-service] Project ${project.id} deadline moved to ${deadline}`);
  res.json(project);
});

app.delete('/projects/:id', async (req, res) => {
  // We no longer call Crew Service. We delete our row and announce "ProjectDeleted";
  // whoever cares (Crew Service today, maybe others tomorrow) cleans up on their own.
  const project = await withTransaction(async (client) => {
    const { rows } = await client.query('DELETE FROM projects WHERE id = $1 RETURNING *', [req.params.id]);
    if (!rows[0]) return null;

    const deleted = toProject(rows[0]);
    await publishProjectEvent('ProjectDeleted', deleted);
    return deleted;
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  console.log(`[project-service] Deleted project ${project.id}`);
  res.json({ deleted: project.id });
});

// Any unexpected error (e.g. database down) ends up here instead of crashing the service.
app.use((err, req, res, next) => {
  console.error(`[project-service] ${req.method} ${req.path} failed: ${err.message}`);
  if (err instanceof EventBusUnavailableError) {
    return res.status(503).json({ error: 'Event bus (Kafka) is unavailable, the change was not saved. Try again later' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// Make sure our tables exist and Kafka is ready (publishing and reading) before accepting requests.
async function start() {
  await migrate();
  await startEvents();
  app.listen(PORT, () => {
    console.log(`[project-service] listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error(`[project-service] Startup failed: ${err.message}`);
  process.exit(1);
});

// Docker sends SIGTERM on "docker compose stop/down" - close connections cleanly.
process.on('SIGTERM', async () => {
  await stopEvents().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(0);
});
