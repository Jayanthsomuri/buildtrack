// The web app's ONLY connection to the back end. Runs on the Next.js server, never in the browser
// ("server-only" makes the build fail if a browser component imports it). The browser talks to
// Next.js alone, so the services don't need CORS and their addresses stay private.

import 'server-only';
import { connection } from 'next/server';

const PROJECT_SERVICE_URL = process.env.PROJECT_SERVICE_URL || 'http://localhost:3001';
const CREW_SERVICE_URL = process.env.CREW_SERVICE_URL || 'http://localhost:3002';

// Carries the service's HTTP status, so pages can turn a 404 into "not found".
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(serviceName, baseUrl, path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store', // always live data
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new ApiError(503, `${serviceName} is unavailable, try again later`);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // The services answer { errors: [...] } for validation and { error: '...' } otherwise.
    throw new ApiError(res.status, data?.errors?.join('. ') ?? data?.error ?? `${serviceName} responded with ${res.status}`);
  }
  return data;
}

// Reads render pages: connection() makes Next.js render them per request with fresh data,
// instead of trying to pre-render them at build time (when the services aren't running).
async function read(serviceName, baseUrl, path) {
  await connection();
  return request(serviceName, baseUrl, path);
}

function query(params) {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value));
  return search.size ? `?${search}` : '';
}

const PROJECT = 'Project service';
const CREW = 'Crew service';

export const projectApi = {
  list: (filters = {}) => read(PROJECT, PROJECT_SERVICE_URL, `/projects${query(filters)}`),
  get: (id) => read(PROJECT, PROJECT_SERVICE_URL, `/projects/${encodeURIComponent(id)}`),
  create: (project) => request(PROJECT, PROJECT_SERVICE_URL, '/projects', { method: 'POST', body: project }),
  update: (id, project) => request(PROJECT, PROJECT_SERVICE_URL, `/projects/${encodeURIComponent(id)}`, { method: 'PUT', body: project }),
  remove: (id) => request(PROJECT, PROJECT_SERVICE_URL, `/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export const crewApi = {
  listWorkers: (filters = {}) => read(CREW, CREW_SERVICE_URL, `/workers${query(filters)}`),
  getWorker: (id) => read(CREW, CREW_SERVICE_URL, `/workers/${encodeURIComponent(id)}`),
  createWorker: (worker) => request(CREW, CREW_SERVICE_URL, '/workers', { method: 'POST', body: worker }),
  updateWorker: (id, worker) => request(CREW, CREW_SERVICE_URL, `/workers/${encodeURIComponent(id)}`, { method: 'PUT', body: worker }),
  removeWorker: (id) => request(CREW, CREW_SERVICE_URL, `/workers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  // Crew Service is the source of truth for who is on a project right now.
  projectWorkers: (projectId) => read(CREW, CREW_SERVICE_URL, `/projects/${encodeURIComponent(projectId)}/workers`),
  assign: (assignment) => request(CREW, CREW_SERVICE_URL, '/assignments', { method: 'POST', body: assignment }),
  endAssignment: (id, endDate) =>
    request(CREW, CREW_SERVICE_URL, `/assignments/${encodeURIComponent(id)}/end`, { method: 'PATCH', body: { endDate } }),
};
