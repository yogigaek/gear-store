import { useEffect } from 'react';
import { Link, useRouteError } from 'react-router';
import { isStaleChunkError, shouldReloadForStaleChunk } from '../../lib/stale-chunk';
import { Button } from '../ui/Button';
import { Label } from '../ui/Label';
import { PageTitle } from '../ui/PageTitle';

/**
 * Shown instead of React Router's own error screen, which prints the error and its stack. A page chunk left
 * behind by a deploy reloads the page once on its own; anything else gets plain words, a retry and the way home.
 * `fullPage` is the last resort, when the layout itself failed and there is no header, footer or dark ground.
 */
export function RouteError({ fullPage = false }: { fullPage?: boolean }) {
  const error = useRouteError();
  const stale = isStaleChunkError(error);
  useEffect(() => {
    if (shouldReloadForStaleChunk(error)) window.location.reload();
  }, [error]);

  return (
    <div className={`surface-dark bg-stage ${fullPage ? 'min-h-dvh' : ''}`}>
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-24 sm:px-6">
        <PageTitle>Page did not load</PageTitle>
        <Label>Error</Label>
        <h1 className="font-expanded text-4xl font-extrabold uppercase">This page did not load</h1>
        <p className="max-w-prose text-ink-2">
          {stale
            ? 'The store was updated while this tab was open. Reload the page to get the new version.'
            : 'Something went wrong on our side while showing this page. Try again, or go back to the store.'}
        </p>
        <div className="flex flex-wrap items-center gap-6 pt-2">
          <Button onClick={() => window.location.reload()}>{stale ? 'Reload' : 'Try again'}</Button>
          <Link to="/" className="inline-block font-semibold underline underline-offset-4">
            Back to the store
          </Link>
        </div>
      </div>
    </div>
  );
}
