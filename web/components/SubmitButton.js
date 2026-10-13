'use client';

// Submit button that disables itself and shows a busy label while the form's action runs.

import { useFormStatus } from 'react-dom';

export default function SubmitButton({ children, pendingText = 'Saving…', variant = 'primary' }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`button ${variant}`} disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
