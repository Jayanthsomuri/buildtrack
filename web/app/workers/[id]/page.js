import Link from 'next/link';
import { notFound } from 'next/navigation';
import ActionForm from '@/components/ActionForm';
import SubmitButton from '@/components/SubmitButton';
import { deleteWorker, endAssignment } from '@/app/actions';
import { crewApi } from '@/lib/api';
import { formatDate, label } from '@/lib/format';

export default async function WorkerPage({ params }) {
  const { id } = await params;
  // Everything here is Crew Service data. Project names come from Crew Service's own copy
  // (kept fresh by "ProjectUpdated" events), so this page works even if Project Service is down.
  const worker = await crewApi.getWorker(id).catch((err) => {
    if (err.status === 404) notFound();
    throw err;
  });

  const current = worker.assignments.filter((a) => !a.endDate);
  const past = worker.assignments.filter((a) => a.endDate);
  const name = `${worker.firstName} ${worker.lastName}`;

  return (
    <>
      <Link href="/workers" className="back">← Workers</Link>
      <div className="page-header">
        <div>
          <h1>{name}</h1>
          <p className="subtitle">
            {label(worker.trade)} · {label(worker.role)}{' '}
            {worker.active
              ? <span className="badge status-completed">Active</span>
              : <span className="badge inactive">Inactive</span>}
          </p>
        </div>
        <div className="actions">
          <Link href={`/workers/${id}/edit`} className="button secondary">Edit</Link>
          <ActionForm action={deleteWorker.bind(null, id)} confirm={`Delete ${name}? Their assignments will be removed too.`}>
            <SubmitButton variant="danger" pendingText="Deleting…">Delete</SubmitButton>
          </ActionForm>
        </div>
      </div>

      <section className="card">
        <h2>Contact</h2>
        <dl className="details">
          <dt>Phone</dt>
          <dd>{worker.phone || '—'}</dd>
        </dl>
      </section>

      <section className="card table-wrap">
        <h2>Current projects</h2>
        {current.length === 0 ? (
          <p className="empty">Not on any project right now. Assign them from a project&apos;s page.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Since</th>
                <th className="right"></th>
              </tr>
            </thead>
            <tbody>
              {current.map((assignment) => (
                <tr key={assignment.id}>
                  <td><Link href={`/projects/${assignment.projectId}`}>{assignment.projectName}</Link></td>
                  <td>{formatDate(assignment.startDate)}</td>
                  <td className="right">
                    <ActionForm
                      action={endAssignment.bind(null, assignment.id)}
                      confirm={`Take ${name} off ${assignment.projectName} as of today?`}
                    >
                      <SubmitButton variant="secondary small" pendingText="Ending…">Take off project</SubmitButton>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {past.length > 0 && (
        <section className="card table-wrap">
          <h2>Past projects</h2>
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>From</th>
                <th>To</th>
              </tr>
            </thead>
            <tbody>
              {past.map((assignment) => (
                <tr key={assignment.id}>
                  <td>{assignment.projectName}</td>
                  <td>{formatDate(assignment.startDate)}</td>
                  <td>{formatDate(assignment.endDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const worker = await crewApi.getWorker(id).catch(() => null);
  return { title: `${worker ? `${worker.firstName} ${worker.lastName}` : 'Worker'} · BuildTrack` };
}
