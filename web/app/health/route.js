// For Docker's healthcheck. Deliberately doesn't call the services: the web app is "up"
// even when a service is down (pages then show an error for that part).
export function GET() {
  return Response.json({ status: 'ok', service: 'web' });
}
