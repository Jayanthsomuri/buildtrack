import Link from 'next/link';
import './globals.css';

export const metadata = {
  title: 'BuildTrack',
  description: 'Construction projects and crews',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/projects" className="brand">BuildTrack</Link>
            <nav>
              <Link href="/projects">Projects</Link>
              <Link href="/workers">Workers</Link>
            </nav>
          </div>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
