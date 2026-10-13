import Link from 'next/link';
import ProjectForm from '@/components/ProjectForm';
import { createProject } from '@/app/actions';

export const metadata = { title: 'New project · BuildTrack' };

export default function NewProjectPage() {
  return (
    <>
      <Link href="/projects" className="back">← Projects</Link>
      <div className="page-header">
        <h1>New project</h1>
      </div>
      <ProjectForm action={createProject} submitText="Create project" />
    </>
  );
}
