import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';
import { projectApi } from '@/lib/api';
import { HOME_TYPES, STATUSES } from '@/lib/constants';
import { formatDate, isOverdue, label } from '@/lib/format';

export const metadata = { title: 'Projects · BuildTrack' };

export default async function ProjectsPage({ searchParams }) {
  const { city = '', status = '', homeType = '', overdue = '' } = await searchParams;
  const all = await projectApi.list({ city, status, homeType });
  const projects = overdue ? all.filter(isOverdue) : all;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <p className="subtitle">{projects.length} {projects.length === 1 ? 'project' : 'projects'}</p>
        </div>
        <Link href="/projects/new" className="button primary">New project</Link>
      </div>

      {/* A plain GET form: filters end up in the URL (?city=...), so filtered views can be bookmarked. */}
      <form className="card filters">
        <label className="field">
          City
          <input name="city" defaultValue={city} placeholder="Any" />
        </label>
        <label className="field">
          Status
          <select name="status" defaultValue={status}>
            <option value="">Any</option>
            {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </label>
        <label className="field">
          Home type
          <select name="homeType" defaultValue={homeType}>
            <option value="">Any</option>
            {HOME_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" name="overdue" value="1" defaultChecked={!!overdue} />
          Overdue only
        </label>
        <div className="actions">
          <button className="button secondary" type="submit">Filter</button>
          <Link href="/projects">Clear</Link>
        </div>
      </form>

      <div className="card table-wrap">
        {projects.length === 0 ? (
          <p className="empty">No projects match. <Link href="/projects/new">Create one</Link>.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Community / Lot</th>
                <th>City</th>
                <th>Home type</th>
                <th>Status</th>
                <th>Deadline</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td><Link href={`/projects/${project.id}`}>{project.name}</Link></td>
                  <td>
                    {[project.location.community, project.location.lotNumber && `Lot ${project.location.lotNumber}`]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </td>
                  <td>{project.address.city}, {project.address.state}</td>
                  <td>{label(project.homeType)}</td>
                  <td><StatusBadge status={project.status} /></td>
                  <td>
                    {formatDate(project.deadline)}{' '}
                    {isOverdue(project) && <span className="badge overdue">Overdue</span>}
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
