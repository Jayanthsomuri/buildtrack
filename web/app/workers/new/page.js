import Link from 'next/link';
import WorkerForm from '@/components/WorkerForm';
import { createWorker } from '@/app/actions';

export const metadata = { title: 'Add worker · BuildTrack' };

export default function NewWorkerPage() {
  return (
    <>
      <Link href="/workers" className="back">← Workers</Link>
      <div className="page-header">
        <h1>Add worker</h1>
      </div>
      <WorkerForm action={createWorker} submitText="Add worker" />
    </>
  );
}
