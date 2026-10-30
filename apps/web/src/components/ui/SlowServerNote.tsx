import { useEffect, useState } from 'react';

/** Render while a first load is under way: after 5 s it says why it may take a while (Render's free tier sleeps). */
export function SlowServerNote({ className = 'text-ink-3' }: { className?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 5000);
    return () => window.clearTimeout(id);
  }, []);
  if (!slow) return null;
  return (
    <p role="status" className={`text-sm ${className}`}>
      The demo server sleeps when idle; the first load can take up to a minute.
    </p>
  );
}
