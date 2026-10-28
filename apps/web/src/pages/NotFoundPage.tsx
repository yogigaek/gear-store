import { Link } from 'react-router';
import { Label } from '../components/ui/Label';
import { PageTitle } from '../components/ui/PageTitle';

export function NotFoundPage({ title = 'Page not found' }: { title?: string }) {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-24 sm:px-6">
      <PageTitle>{title}</PageTitle>
      <Label>Error 404</Label>
      <h1 className="font-expanded text-4xl font-extrabold uppercase">{title}</h1>
      <p className="text-ink-2">This page does not exist, or the product was removed from the catalogue.</p>
      <Link to="/" className="inline-block font-semibold underline underline-offset-4">
        Back to the store
      </Link>
    </div>
  );
}
