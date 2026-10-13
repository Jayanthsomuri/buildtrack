'use client';

// A <form> wired to a Server Action. Shows the action's { error } under the fields,
// and can ask "Are you sure?" first (for deletes).

import { useActionState } from 'react';

export default function ActionForm({ action, confirm, className, children }) {
  const [state, formAction] = useActionState(action, null);

  function handleSubmit(event) {
    if (confirm && !window.confirm(confirm)) event.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className={className}>
      {children}
      {state?.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
