import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card">
      <h1>Not found</h1>
      <p className="empty">That project or worker doesn&apos;t exist (it may have been deleted).</p>
      <p><Link href="/projects">Back to projects</Link></p>
    </div>
  );
}
