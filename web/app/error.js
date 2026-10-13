'use client';

// Shown when a page can't load its data - usually because a service is down.
// (In production Next.js hides the real server error from the browser; it's in the web container's log.)

export default function ErrorPage({ reset }) {
  return (
    <div className="card">
      <h1>Couldn&apos;t load this page</h1>
      <p className="notice">One of the BuildTrack services may be unavailable. Try again in a moment.</p>
      <button className="button secondary" onClick={() => reset()}>Try again</button>
    </div>
  );
}
