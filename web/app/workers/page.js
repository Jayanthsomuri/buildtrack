import Link from 'next/link';
import { crewApi } from '@/lib/api';
import { TRADES } from '@/lib/constants';
import { label } from '@/lib/format';

export const metadata = { title: 'Workers · BuildTrack' };

export default async function WorkersPage({ searchParams }) {
  const { trade = '', active = '' } = await searchParams;
  const workers = await crewApi.listWorkers({ trade, active });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Workers</h1>
          <p className="subtitle">{workers.length} {workers.length === 1 ? 'worker' : 'workers'}</p>
        </div>
        <Link href="/workers/new" className="button primary">Add worker</Link>
      </div>

      <form className="card filters">
        <label className="field">
          Trade
          <select name="trade" defaultValue={trade}>
            <option value="">Any</option>
            {TRADES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
        </label>
        <label className="field">
          Status
          <select name="active" defaultValue={active}>
            <option value="">Any</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </label>
        <div className="actions">
          <button className="button secondary" type="submit">Filter</button>
          <Link href="/workers">Clear</Link>
        </div>
      </form>

      <div className="card table-wrap">
        {workers.length === 0 ? (
          <p className="empty">No workers match. <Link href="/workers/new">Add one</Link>.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Trade</th>
                <th>Role</th>
                <th>Phone</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((worker) => (
                <tr key={worker.id}>
                  <td><Link href={`/workers/${worker.id}`}>{worker.firstName} {worker.lastName}</Link></td>
                  <td>{label(worker.trade)}</td>
                  <td>{label(worker.role)}</td>
                  <td>{worker.phone || '—'}</td>
                  <td>
                    {worker.active
                      ? <span className="badge status-completed">Active</span>
                      : <span className="badge inactive">Inactive</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
