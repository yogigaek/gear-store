import { Link } from 'react-router';

/** The eyebrow of a page under the account: "Account / Orders", the first step a link back. */
export function AccountCrumb({ page }: { page: string }) {
  return (
    <nav aria-label="Breadcrumb" className="font-mono text-xs text-ink-3">
      <Link to="/account" className="hover:text-ink">
        Account
      </Link>
      <span aria-hidden="true"> / </span>
      <span aria-current="page" className="text-ink">
        {page}
      </span>
    </nav>
  );
}
