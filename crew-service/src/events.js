// Kafka for Crew Service - it both READS the bulletin board and PINS its own notices.
//   Consumer: reads "project-events" (from Project Service) and reacts.
//   Producer: pins "crew-events" (worker assigned / assignment ended / ...) for whoever cares.
// Kafka remembers how far the "crew-service" group has read (its offset), so after a
// restart or outage it continues from where it stopped and catches up on missed events.

const crypto = require('node:crypto');
const { Kafka, Partitioners, logLevel } = require('kafkajs');
const { pool } = require('./db');

const PROJECT_TOPIC = 'project-events'; // we read this one
const CREW_TOPIC = 'crew-events'; // we write this one

const brokers = (process.env.KAFKA_BROKERS || 'localhost:9094').split(',');

// The consumer may wait and retry patiently - nobody is waiting on it.
const kafka = new Kafka({ clientId: 'crew-service', brokers, logLevel: logLevel.WARN });

// The producer runs inside API requests: give up within a few seconds when Kafka is down,
// so the API answers 503 instead of hanging.
const producerKafka = new Kafka({
  clientId: 'crew-service',
  brokers,
  logLevel: logLevel.WARN,
  connectionTimeout: 1000,
  retry: { retries: 2, initialRetryTime: 200, maxRetryTime: 1000 },
});

const consumer = kafka.consumer({ groupId: 'crew-service' });
const producer = producerKafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });

// Thrown when a notice can't be pinned, so the API can answer 503 and cancel the change.
class EventBusUnavailableError extends Error {}

// Handlers must be safe to run twice for the same event ("idempotent"):
// Kafka guarantees each event is delivered AT LEAST once, so duplicates can happen.
// Note: these handlers only REACT - they never publish crew-events. Publishing in reaction
// to someone else's event is how two services end up bouncing messages back and forth forever.
const handlers = {
  async ProjectDeleted(event) {
    const { rowCount } = await pool.query('DELETE FROM assignments WHERE project_id = $1', [event.projectId]);
    console.log(`[crew-service] ProjectDeleted ${event.projectId}: removed ${rowCount} assignments`);
  },

  async ProjectUpdated(event) {
    // Refresh our copy of the project name.
    const { rowCount } = await pool.query(
      'UPDATE assignments SET project_name = $1 WHERE project_id = $2 AND project_name <> $1',
      [event.data.name, event.projectId],
    );
    if (rowCount) {
      console.log(`[crew-service] ProjectUpdated ${event.projectId}: renamed to "${event.data.name}" on ${rowCount} assignments`);
    }
  },
};

// Create the topics up front (does nothing if they already exist). Either service may start
// first, and subscribing to / publishing on a topic whose partitions aren't ready yet fails.
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
  await consumer.subscribe({ topic: PROJECT_TOPIC, fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      let event;
      try {
        event = JSON.parse(message.value.toString());
      } catch {
        // A broken message would otherwise be retried forever and block everything behind it.
        console.error(`[crew-service] Skipping unreadable message at offset ${message.offset}`);
        return;
      }

      const handle = handlers[event.type];
      if (!handle) return; // not an event we care about

      // If this throws (e.g. database down), KafkaJS doesn't move the bookmark and retries the event.
      await handle(event);
    },
  });

  console.log(`[crew-service] Listening for events on "${PROJECT_TOPIC}"`);
}

async function startEvents() {
  await ensureTopics();
  await producer.connect();
  await startConsumer();
}

async function stopEvents() {
  await consumer.disconnect();
  await producer.disconnect();
}

// type: 'WorkerAssigned' | 'AssignmentEnded' | 'AssignmentRemoved' | 'WorkerUpdated'
// Each item: { type, workerId, data }. Several events go out in one send.
async function publishCrewEvents(items) {
  if (!items.length) return;

  const messages = items.map(({ type, workerId, data }) => ({
    // Same key -> same partition, so everything about one worker (assigned, renamed, ended...)
    // is always read in the order it happened.
    key: workerId,
    value: JSON.stringify({
      eventId: crypto.randomUUID(),
      type,
      occurredAt: new Date().toISOString(),
      workerId,
      data,
    }),
  }));

  try {
    await producer.send({ topic: CREW_TOPIC, messages });
  } catch (err) {
    throw new EventBusUnavailableError(`Could not publish ${items.map((i) => i.type).join(', ')}: ${err.message}`);
  }

  for (const { type, workerId } of items) {
    console.log(`[crew-service] Published ${type} for worker ${workerId}`);
  }
}

module.exports = { startEvents, stopEvents, publishCrewEvents, EventBusUnavailableError };
