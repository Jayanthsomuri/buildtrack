import { Fragment } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ActionForm from '@/components/ActionForm';
import StatusBadge from '@/components/StatusBadge';
import SubmitButton from '@/components/SubmitButton';
import { assignWorker, deleteProject, endAssignment } from '@/app/actions';
import { projectApi, crewApi } from '@/lib/api';
import { formatDate, isOverdue, label, today } from '@/lib/format';

export default async function ProjectPage({ params }) {
  const { id } = await params;

  // This page combines BOTH services. The project comes from Project Service; the crew from
  // Crew Service. If Crew Service is down, we still show the project - just not the crew.
  const [projectResult, crewResult, workersResult] = await Promise.allSettled([
    projectApi.get(id),
    crewApi.projectWorkers(id),
    crewApi.listWorkers({ active: 'true' }),
  ]);

  if (projectResult.status === 'rejected') {
    if (projectResult.reason.status === 404) notFound();
    throw projectResult.reason;
  }
  const project = projectResult.value;
  const crewAvailable = crewResult.status === 'fulfilled' && workersResult.status === 'fulfilled';
  const crew = crewAvailable ? crewResult.value : [];
  const onProject = new Set(crew.map((worker) => worker.id));
  const assignable = crewAvailable ? workersResult.value.filter((worker) => !onProject.has(worker.id)) : [];

  const byTrade = {};
  for (const worker of crew) byTrade[worker.trade] = (byTrade[worker.trade] ?? 0) + 1;

  const { address, location } = project;

  return (
    <>
      <Link href="/projects" className="back">← Projects</Link>
      <div className="page-header">
        <div>
          <h1>{project.name}</h1>
          <p className="subtitle">
            <StatusBadge status={project.status} />{' '}
            {isOverdue(project) && <span className="badge overdue">Overdue</span>}
          </p>
        </div>
        <div className="actions">
          <Link href={`/projects/${id}/edit`} className="button secondary">Edit</Link>
          <ActionForm
            action={deleteProject.bind(null, id)}
            confirm={`Delete "${project.name}"? Its crew assignments will be removed too.`}
          >
            <SubmitButton variant="danger" pendingText="Deleting…">Delete</SubmitButton>
          </ActionForm>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Details</h2>
          <dl className="details">
            <dt>Address</dt>
            <dd>{address.street}<br />{address.city}, {address.state} {address.zip}</dd>
            <dt>Community</dt>
            <dd>{location.community || '—'}</dd>
            <dt>Lot</dt>
            <dd>{location.lotNumber || '—'}</dd>
            <dt>Home type</dt>
            <dd>{label(project.homeType)}</dd>
            <dt>Deadline</dt>
            <dd>{formatDate(project.deadline)}</dd>
          </dl>
        </section>

        <section className="card">
          <h2>Headcount</h2>
          {!crewAvailable ? (
            <p className="notice">Crew service is unavailable - crew information can&apos;t be shown right now.</p>
          ) : (
            <dl className="details">
              <dt>Total on site</dt>
              <dd><strong>{crew.length}</strong></dd>
              {Object.entries(byTrade).map(([trade, count]) => (
                <Fragment key={trade}>
                  <dt>{label(trade)}</dt>
                  <dd>{count}</dd>
                </Fragment>
              ))}
            </dl>
          )}
        </section>
      </div>

      {crewAvailable && (
        <section className="card">
          <h2>Crew on site</h2>
          {crew.length === 0 ? (
            <p className="empty">Nobody is assigned yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Trade</th>
                    <th>Role</th>
                    <th>Since</th>
                    <th className="right"></th>
                  </tr>
                </thead>
                <tbody>
                  {crew.map((worker) => (
                    <tr key={worker.assignmentId}>
                      <td><Link href={`/workers/${worker.id}`}>{worker.firstName} {worker.lastName}</Link></td>
                      <td>{label(worker.trade)}</td>
                      <td>{label(worker.role)}</td>
                      <td>{formatDate(worker.startDate)}</td>
                      <td className="right">
                        <ActionForm
                          action={endAssignment.bind(null, worker.assignmentId)}
                          confirm={`Take ${worker.firstName} ${worker.lastName} off this project as of today?`}
                        >
                          <SubmitButton variant="secondary small" pendingText="Ending…">Take off project</SubmitButton>
                        </ActionForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 style={{ marginTop: 24 }}>Assign a worker</h2>
          {assignable.length === 0 ? (
            <p className="empty">
              No active workers available. <Link href="/workers/new">Add a worker</Link>.
            </p>
          ) : (
            <ActionForm action={assignWorker.bind(null, id)} className="inline-form">
              <label className="field">
                Worker
                <select name="workerId" defaultValue="" required>
                  <option value="" disabled>Choose…</option>
                  {assignable.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.firstName} {worker.lastName} — {label(worker.trade)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Start date
                <input name="startDate" type="date" defaultValue={today()} required />
              </label>
              <SubmitButton pendingText="Assigning…">Assign</SubmitButton>
            </ActionForm>
          )}
        </section>
      )}
    </>
  );
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const project = await projectApi.get(id).catch(() => null);
  return { title: `${project?.name ?? 'Project'} · BuildTrack` };
}
