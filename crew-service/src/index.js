// Crew Service
// Owns: workers (people) and their assignments to projects.
// Knows nothing about addresses or deadlines - to check a project exists, it calls Project Service.

const express = require('express');
const { pool, migrate } = require('./db');
const { startEvents, stopEvents, publishCrewEvents, EventBusUnavailableError } = require('./events');

const app = express();
app.use(express.json());
// Express 5 leaves req.body undefined when no JSON was sent; default it to {}.
app.use((req, res, next) => {
  req.body ??= {};
  next();
});

const PORT = process.env.PORT || 3002;
const PROJECT_SERVICE_URL = process.env.PROJECT_SERVICE_URL || 'http://localhost:3001';

const TRADES = ['framing', 'concrete', 'electrical', 'plumbing', 'roofing', 'drywall'];
const ROLES = ['lead', 'worker', 'apprentice'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = '23505'; // PostgreSQL error code

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function validateWorker(body) {
  const errors = [];
  const { firstName, lastName, trade, role = 'worker', active = true } = body;
  if (!firstName) errors.push('firstName is required');
  if (!lastName) errors.push('lastName is required');
  if (!TRADES.includes(trade)) errors.push(`trade must be one of: ${TRADES.join(', ')}`);
  if (!ROLES.includes(role)) errors.push(`role must be one of: ${ROLES.join(', ')}`);
  if (typeof active !== 'boolean') errors.push('active must be true or false');
  return errors;
}

// Request body -> query parameters, in the column order used by INSERT and UPDATE below.
function toWorkerParams(body) {
  const { firstName, lastName, phone = null, trade, role = 'worker', active = true } = body;
  return [firstName, lastName, phone, trade, role, active];
}

// Database rows (snake_case) -> API responses (camelCase), same shape as before.
function toWorker(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    trade: row.trade,
    role: row.role,
    active: row.active,
  };
}

function toAssignment(row) {
  return {
    id: row.id,
    workerId: row.worker_id,
    projectId: row.project_id,
    projectName: row.project_name,
    startDate: row.start_date,
    endDate: row.end_date,
  };
}

// The crew-events payloads. Project Service keeps its own copy of who is on each project from these.
function toAssignedEvent(assignment, worker) {
  return {
    type: 'WorkerAssigned',
    workerId: worker.id,
    data: {
      assignmentId: assignment.id,
      projectId: assignment.projectId,
      workerName: `${worker.firstName} ${worker.lastName}`,
      trade: worker.trade,
      startDate: assignment.startDate,
    },
  };
}

function toWorkerUpdatedEvent(worker) {
  return {
    type: 'WorkerUpdated',
    workerId: worker.id,
    data: { workerName: `${worker.firstName} ${worker.lastName}`, trade: worker.trade, active: worker.active },
  };
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

// Calls Project Service over the network. Returns null if the project doesn't exist,
// throws if Project Service can't be reached.
async function fetchProject(projectId) {
  const res = await fetch(`${PROJECT_SERVICE_URL}/projects/${encodeURIComponent(projectId)}`, {
    signal: AbortSignal.timeout(3000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Project service responded with ${res.status}`);
  return res.json();
}

// Ids are UUIDs - anything else can't exist, so answer 404 before it reaches the database.
app.param('id', (req, res, next, id) => {
  if (!UUID_PATTERN.test(id)) return res.status(404).json({ error: 'Not found' });
  next();
});
app.param('projectId', (req, res, next, projectId) => {
  if (!UUID_PATTERN.test(projectId)) return res.status(404).json({ error: 'Project not found' });
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'crew-service' });
});

// ---------- Workers ----------

app.post('/workers', async (req, res) => {
  const errors = validateWorker(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const { rows } = await pool.query(
    `INSERT INTO workers (first_name, last_name, phone, trade, role, active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    toWorkerParams(req.body),
  );
  const worker = toWorker(rows[0]);

  console.log(`[crew-service] Added worker ${worker.id} (${worker.firstName} ${worker.lastName}, ${worker.trade})`);
  res.status(201).json(worker);
});

app.get('/workers', async (req, res) => {
  const { trade, active } = req.query;
  const conditions = [];
  const params = [];
  if (trade) {
    params.push(trade);
    conditions.push(`trade = $${params.length}`);
  }
  if (active === 'true' || active === 'false') {
    params.push(active === 'true');
    conditions.push(`active = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(`SELECT * FROM workers ${where} ORDER BY last_name, first_name`, params);
  res.json(rows.map(toWorker));
});

app.get('/workers/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM workers WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Worker not found' });

  const { rows: assignmentRows } = await pool.query(
    'SELECT * FROM assignments WHERE worker_id = $1 ORDER BY start_date',
    [req.params.id],
  );
  res.json({ ...toWorker(rows[0]), assignments: assignmentRows.map(toAssignment) });
});

app.put('/workers/:id', async (req, res) => {
  const errors = validateWorker(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const worker = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE workers SET first_name = $1, last_name = $2, phone = $3, trade = $4, role = $5, active = $6
       WHERE id = $7
       RETURNING *`,
      [...toWorkerParams(req.body), req.params.id],
    );
    if (!rows[0]) return null;

    const updated = toWorker(rows[0]);
    await publishCrewEvents([toWorkerUpdatedEvent(updated)]);
    return updated;
  });
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  console.log(`[crew-service] Updated worker ${req.params.id}`);
  res.json(worker);
});

app.delete('/workers/:id', async (req, res) => {
  // Both tables are in OUR database, so we can use a transaction: either the worker
  // and all their assignments are deleted, or nothing is. (Not possible across services.)
  const result = await withTransaction(async (client) => {
    const { rows: removed } = await client.query('DELETE FROM assignments WHERE worker_id = $1 RETURNING *', [req.params.id]);
    const { rowCount: workersRemoved } = await client.query('DELETE FROM workers WHERE id = $1', [req.params.id]);
    if (!workersRemoved) return null;

    // Tell Project Service about the assignments that were still active (ended ones it already dropped).
    await publishCrewEvents(
      removed
        .filter((row) => !row.end_date)
        .map((row) => ({
          type: 'AssignmentRemoved',
          workerId: row.worker_id,
          data: { assignmentId: row.id, projectId: row.project_id },
        })),
    );
    return { assignmentsRemoved: removed.length };
  });
  if (!result) return res.status(404).json({ error: 'Worker not found' });

  console.log(`[crew-service] Deleted worker ${req.params.id} (${result.assignmentsRemoved} assignments removed)`);
  res.json({ deleted: req.params.id, assignmentsRemoved: result.assignmentsRemoved });
});

// ---------- Assignments ----------

app.post('/assignments', async (req, res) => {
  const { workerId, projectId, startDate } = req.body;
  if (!workerId || !projectId || !isValidDate(startDate)) {
    return res.status(400).json({ error: 'workerId, projectId and startDate (YYYY-MM-DD) are required' });
  }
  if (!UUID_PATTERN.test(workerId)) return res.status(404).json({ error: 'Worker not found' });
  if (!UUID_PATTERN.test(projectId)) return res.status(404).json({ error: 'Project not found' });

  // 1. Worker is our own data - a local database lookup.
  const { rows: workerRows } = await pool.query('SELECT * FROM workers WHERE id = $1', [workerId]);
  const worker = workerRows[0] && toWorker(workerRows[0]);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });
  if (!worker.active) return res.status(409).json({ error: 'Worker is inactive' });

  // 2. Project is someone else's data - a network call that might fail.
  //    (Our database can't check project_id - it has no access to projects_db.)
  let project;
  try {
    project = await fetchProject(projectId);
  } catch (err) {
    console.error(`[crew-service] Could not reach project-service: ${err.message}`);
    return res.status(503).json({ error: 'Project service is unavailable, try again later' });
  }
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // 3. Save it, keeping a copy of the project name so reads don't depend on Project Service.
  //    The unique index rejects a second active assignment to the same project.
  //    Then announce "WorkerAssigned" - if that fails, the assignment isn't saved.
  try {
    const assignment = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO assignments (worker_id, project_id, project_name, start_date)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [workerId, projectId, project.name, startDate],
      );
      const created = toAssignment(rows[0]);
      await publishCrewEvents([toAssignedEvent(created, worker)]);
      return created;
    });
    console.log(`[crew-service] Assigned ${worker.firstName} ${worker.lastName} to ${project.name} from ${startDate}`);
    res.status(201).json(assignment);
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: 'Worker is already assigned to this project' });
    }
    throw err;
  }
});

app.patch('/assignments/:id/end', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM assignments WHERE id = $1', [req.params.id]);
  const assignment = rows[0] && toAssignment(rows[0]);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
  if (assignment.endDate) return res.status(409).json({ error: 'Assignment has already ended' });

  const endDate = req.body.endDate ?? new Date().toISOString().slice(0, 10);
  if (!isValidDate(endDate)) return res.status(400).json({ error: 'endDate must be a date in YYYY-MM-DD format' });
  if (endDate < assignment.startDate) return res.status(400).json({ error: 'endDate cannot be before startDate' });

  const ended = await withTransaction(async (client) => {
    const { rows: updated } = await client.query(
      'UPDATE assignments SET end_date = $1 WHERE id = $2 RETURNING *',
      [endDate, req.params.id],
    );
    const result = toAssignment(updated[0]);
    await publishCrewEvents([{
      type: 'AssignmentEnded',
      workerId: result.workerId,
      data: { assignmentId: result.id, projectId: result.projectId, endDate },
    }]);
    return result;
  });
  console.log(`[crew-service] Ended assignment ${req.params.id} on ${endDate}`);
  res.json(ended);
});

// ---------- Per-project views (answered from our own data, no call to Project Service) ----------

app.get('/projects/:projectId/workers', async (req, res) => {
  // A JOIN is fine here: workers and assignments are both in OUR database.
  const { rows } = await pool.query(
    `SELECT w.*, a.id AS assignment_id, a.start_date
     FROM assignments a
     JOIN workers w ON w.id = a.worker_id
     WHERE a.project_id = $1 AND a.end_date IS NULL
     ORDER BY a.start_date`,
    [req.params.projectId],
  );
  res.json(rows.map((row) => ({ ...toWorker(row), assignmentId: row.assignment_id, startDate: row.start_date })));
});

app.get('/projects/:projectId/headcount', async (req, res) => {
  const { projectId } = req.params;
  const { rows } = await pool.query(
    `SELECT w.trade, COUNT(*)::int AS count, MAX(a.project_name) AS project_name
     FROM assignments a
     JOIN workers w ON w.id = a.worker_id
     WHERE a.project_id = $1 AND a.end_date IS NULL
     GROUP BY w.trade`,
    [projectId],
  );

  const byTrade = Object.fromEntries(rows.map((r) => [r.trade, r.count]));
  res.json({
    projectId,
    projectName: rows[0]?.project_name ?? null,
    total: rows.reduce((sum, r) => sum + r.count, 0),
    byTrade,
  });
});

// Any unexpected error (e.g. database down) ends up here instead of crashing the service.
app.use((err, req, res, next) => {
  console.error(`[crew-service] ${req.method} ${req.path} failed: ${err.message}`);
  if (err instanceof EventBusUnavailableError) {
    return res.status(503).json({ error: 'Event bus (Kafka) is unavailable, the change was not saved. Try again later' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// Make sure our tables exist and Kafka is ready (reading and publishing) before accepting requests.
async function start() {
  await migrate();
  await startEvents();
  app.listen(PORT, () => {
    console.log(`[crew-service] listening on http://localhost:${PORT}  (project-service at ${PROJECT_SERVICE_URL})`);
  });
}

start().catch((err) => {
  console.error(`[crew-service] Startup failed: ${err.message}`);
  process.exit(1);
});

// Docker sends SIGTERM on "docker compose stop/down". Leaving the consumer group cleanly
// lets Kafka hand our partitions to another copy right away instead of waiting for a timeout.
process.on('SIGTERM', async () => {
  await stopEvents().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(0);
});
