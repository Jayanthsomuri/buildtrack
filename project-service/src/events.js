// Kafka for Project Service - it both PINS notices and READS the bulletin board.
//   Producer: pins "project-events" (project updated / deleted). It doesn't know who reads them.
//   Consumer: reads "crew-events" (from Crew Service) to keep its own copy of who works on each project.

const crypto = require('node:crypto');
const { Kafka, Partitioners, logLevel } = require('kafkajs');
const { pool } = require('./db');

const PROJECT_TOPIC = 'project-events'; // we write this one
const CREW_TOPIC = 'crew-events'; // we read this one

const brokers = (process.env.KAFKA_BROKERS || 'localhost:9094').split(',');

// The producer runs inside API requests: give up within a few seconds when Kafka is down,
// so the API answers 503 instead of hanging.
const kafka = new Kafka({
  clientId: 'project-service',
  brokers,
  logLevel: logLevel.WARN,
  connectionTimeout: 1000,
  retry: { retries: 2, initialRetryTime: 200, maxRetryTime: 1000 },
});

// The consumer may wait and retry patiently - nobody is waiting on it.
const consumerKafka = new Kafka({ clientId: 'project-service', brokers, logLevel: logLevel.WARN });

const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });
const consumer = consumerKafka.consumer({ groupId: 'project-service' });

// Thrown when the notice can't be pinned, so the API can answer 503 and cancel the change.
class EventBusUnavailableError extends Error {}

// Handlers must be safe to run twice for the same event ("idempotent"):
// Kafka guarantees each event is delivered AT LEAST once, so duplicates can happen.
// Note: these handlers only REACT - they never publish project-events. Publishing in reaction
// to someone else's event is how two services end up bouncing messages back and forth forever.
const handlers = {
  async WorkerAssigned(event) {
    const { assignmentId, projectId, workerName, trade, startDate } = event.data;
    // ON CONFLICT DO NOTHING: a duplicate event finds the row already there.
    // WHERE EXISTS: the project may have been deleted meanwhile - then there's nothing to track.
    const { rowCount } = await pool.query(
      `INSERT INTO project_crew (assignment_id, project_id, worker_id, worker_name, trade, start_date)
       SELECT $1, $2, $3, $4, $5, $6
       WHERE EXISTS (SELECT 1 FROM projects WHERE id = $2)
       ON CONFLICT (assignment_id) DO NOTHING`,
      [assignmentId, projectId, event.workerId, workerName, trade, startDate],
    );
    if (rowCount) console.log(`[project-service] WorkerAssigned: ${workerName} (${trade}) on project ${projectId}`);
  },

  async AssignmentEnded(event) {
    await removeFromCrew(event);
  },

  async AssignmentRemoved(event) {
    await removeFromCrew(event);
  },

  async WorkerUpdated(event) {
    // Refresh our copy of the worker's name and trade on every project they're on.
    const { workerName, trade } = event.data;
    await pool.query(
      'UPDATE project_crew SET worker_name = $1, trade = $2 WHERE worker_id = $3',
      [workerName, trade, event.workerId],
    );
  },
};

async function removeFromCrew(event) {
  const { assignmentId, projectId } = event.data;
  const { rowCount } = await pool.query('DELETE FROM project_crew WHERE assignment_id = $1', [assignmentId]);
  if (rowCount) console.log(`[project-service] ${event.type}: worker ${event.workerId} left project ${projectId}`);
}

// Create the topics up front (does nothing if they already exist). Either service may start
// first, and publishing on / subscribing to a topic whose partitions aren't ready yet fails.
async function ensureTopics() {
  const admin = kafka.admin();
  await admin.connect();
  try {
    const existing = await admin.listTopics();
    const missing = [PROJECT_TOPIC, CREW_TOPIC].filter((topic) => !existing.includes(topic));
    if (missing.length) {
      await admin.createTopics({ topics: missing.map((topic) => ({ topic, numPartitions: 3 })), waitForLeaders: true });
    }
  } finally {
    await admin.disconnect();
  }
}

async function startConsumer() {
  await consumer.connect();
  // fromBeginning applies only the very first time this group runs (no bookmark yet):
  // read the whole history. After that Kafka resumes from the saved offset.
  await consumer.subscribe({ topic: CREW_TOPIC, fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      let event;
      try {
        event = JSON.parse(message.value.toString());
      } catch {
        // A broken message would otherwise be retried forever and block everything behind it.
        console.error(`[project-service] Skipping unreadable message at offset ${message.offset}`);
        return;
      }

      const handle = handlers[event.type];
      if (!handle) return; // not an event we care about

      // If this throws (e.g. database down), KafkaJS doesn't move the bookmark and retries the event.
      await handle(event);
    },
  });

  console.log(`[project-service] Listening for events on "${CREW_TOPIC}"`);
}

async function startEvents() {
  await ensureTopics();
  await producer.connect();
  console.log('[project-service] Connected to Kafka');
  await startConsumer();
}

async function stopEvents() {
  await consumer.disconnect();
  await producer.disconnect();
}

// type: 'ProjectUpdated' | 'ProjectDeleted'
async function publishProjectEvent(type, project) {
  const event = {
    eventId: crypto.randomUUID(),
    type,
    occurredAt: new Date().toISOString(),
    projectId: project.id,
    data: project,
  };

  try {
    await producer.send({
      topic: PROJECT_TOPIC,
      // Same key -> same partition, so events about one project are always read in order.
      messages: [{ key: project.id, value: JSON.stringify(event) }],
    });
  } catch (err) {
    throw new EventBusUnavailableError(`Could not publish ${type}: ${err.message}`);
  }

  console.log(`[project-service] Published ${type} for project ${project.id}`);
}

module.exports = { startEvents, stopEvents, publishProjectEvent, EventBusUnavailableError };
