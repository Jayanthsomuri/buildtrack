import Link from 'next/link';
import { notFound } from 'next/navigation';
import WorkerForm from '@/components/WorkerForm';
import { updateWorker } from '@/app/actions';
import { crewApi } from '@/lib/api';

export const metadata = { title: 'Edit worker · BuildTrack' };

export default async function EditWorkerPage({ params }) {
  const { id } = await params;
  const worker = await crewApi.getWorker(id).catch((err) => {
    if (err.status === 404) notFound();
    throw err;
  });

  return (
    <>
      <Link href={`/workers/${id}`} className="back">← {worker.firstName} {worker.lastName}</Link>
      <div className="page-header">
        <h1>Edit worker</h1>
      </div>
      <WorkerForm action={updateWorker.bind(null, id)} worker={worker} submitText="Save changes" />
    </>
  );
}
