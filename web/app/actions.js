'use server';

// Server Actions: every form in the app submits to one of these. They run on the Next.js server
// (never in the browser), call the services, then either redirect or return { error } for the form to show.
// Signature is (boundArgs..., previousState, formData) - see components/ActionForm.js.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { projectApi, crewApi } from '@/lib/api';
import { today } from '@/lib/format';

function text(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function number(formData, name) {
  const value = text(formData, name);
  return value === undefined ? undefined : Number(value);
}

function toProject(formData) {
  return {
    name: text(formData, 'name'),
    address: {
      street: text(formData, 'street'),
      city: text(formData, 'city'),
      state: text(formData, 'state'),
      zip: text(formData, 'zip'),
    },
    location: {
      community: text(formData, 'community'),
      lotNumber: text(formData, 'lotNumber'),
      latitude: number(formData, 'latitude'),
      longitude: number(formData, 'longitude'),
    },
    homeType: text(formData, 'homeType'),
    deadline: text(formData, 'deadline'),
    status: text(formData, 'status'),
  };
}

function toWorker(formData) {
  return {
    firstName: text(formData, 'firstName'),
    lastName: text(formData, 'lastName'),
    phone: text(formData, 'phone') ?? null,
    trade: text(formData, 'trade'),
    role: text(formData, 'role'),
    // A checkbox is only sent when ticked. New-worker form has no checkbox -> active.
    active: formData.has('activeField') ? formData.get('active') === 'on' : true,
  };
}

// Runs a service call; on failure returns { error } for the form instead of throwing.
// (redirect() must stay OUTSIDE this - it works by throwing, and must not be caught.)
async function attempt(call) {
  try {
    return { result: await call() };
  } catch (err) {
    return { error: err.message };
  }
}

// Every page renders live data, but the browser keeps already-visited pages for a moment.
// This tells it the data changed, so the current page re-renders with the new values.
function refresh() {
  revalidatePath('/', 'layout');
}

// ---------- Projects ----------

export async function createProject(prevState, formData) {
  const { result, error } = await attempt(() => projectApi.create(toProject(formData)));
  if (error) return { error };
  refresh();
  redirect(`/projects/${result.id}`);
}

export async function updateProject(id, prevState, formData) {
  const { error } = await attempt(() => projectApi.update(id, toProject(formData)));
  if (error) return { error };
  refresh();
  redirect(`/projects/${id}`);
}

export async function deleteProject(id) {
  // Project Service publishes "ProjectDeleted"; Crew Service removes the assignments on its own.
  const { error } = await attempt(() => projectApi.remove(id));
  if (error) return { error };
  refresh();
  redirect('/projects');
}

// ---------- Workers ----------

export async function createWorker(prevState, formData) {
  const { result, error } = await attempt(() => crewApi.createWorker(toWorker(formData)));
  if (error) return { error };
  refresh();
  redirect(`/workers/${result.id}`);
}

export async function updateWorker(id, prevState, formData) {
  const { error } = await attempt(() => crewApi.updateWorker(id, toWorker(formData)));
  if (error) return { error };
  refresh();
  redirect(`/workers/${id}`);
}

export async function deleteWorker(id) {
  const { error } = await attempt(() => crewApi.removeWorker(id));
  if (error) return { error };
  refresh();
  redirect('/workers');
}

// ---------- Assignments ----------

export async function assignWorker(projectId, prevState, formData) {
  const workerId = text(formData, 'workerId');
  if (!workerId) return { error: 'Choose a worker' };

  const { error } = await attempt(() =>
    crewApi.assign({ workerId, projectId, startDate: text(formData, 'startDate') ?? today() }),
  );
  if (error) return { error };
  refresh();
  return null;
}

export async function endAssignment(assignmentId) {
  const { error } = await attempt(() => crewApi.endAssignment(assignmentId, today()));
  if (error) return { error };
  refresh();
  return null;
}
