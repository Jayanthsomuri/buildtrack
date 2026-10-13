// Small display helpers shared by the pages.

// 'YYYY-MM-DD' (what the services send) -> 'Mar 31, 2027'.
export function formatDate(value) {
  if (!value) return '';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// 'in-progress' -> 'In progress'
export function label(value) {
  if (!value) return '';
  const text = value.replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function isOverdue(project) {
  return project.deadline < today() && project.status !== 'completed';
}
