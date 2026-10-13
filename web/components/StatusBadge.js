import { label } from '@/lib/format';

export default function StatusBadge({ status }) {
  return <span className={`badge status-${status}`}>{label(status)}</span>;
}
