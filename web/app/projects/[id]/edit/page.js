import Link from 'next/link';
import { notFound } from 'next/navigation';
import ProjectForm from '@/components/ProjectForm';
import { updateProject } from '@/app/actions';
import { projectApi } from '@/lib/api';

export const metadata = { title: 'Edit project · BuildTrack' };

export default async function EditProjectPage({ params }) {
  const { id } = await params;
  const project = await projectApi.get(id).catch((err) => {
    if (err.status === 404) notFound();
    throw err;
  });

  return (
    <>
      <Link href={`/projects/${id}`} className="back">← {project.name}</Link>
      <div className="page-header">
        <h1>Edit project</h1>
      </div>
      {/* bind() fills in the first argument (the id); the form adds the rest. */}
      <ProjectForm action={updateProject.bind(null, id)} project={project} submitText="Save changes" />
    </>
  );
}
