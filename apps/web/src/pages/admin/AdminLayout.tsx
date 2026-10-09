import { NavLink, Outlet } from 'react-router';
import { Label } from '../../components/ui/Label';
import { useAuth } from '../../lib/auth-context';

const sections = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/customers', label: 'Customers' },
];

export function AdminLayout() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {user?.isDemo && (
        <p role="status" className="mb-6 border-l-[3px] border-signal bg-alu-50 px-4 py-3 text-sm">
          <strong>Demo administrator, read-only.</strong> Every screen and form works, but saving is switched
          off because every visitor shares this account.
        </p>
      )}
      {/* minmax(0, 1fr): the scrolling tab row must not widen the column on phones */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <nav aria-label="Admin" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <Label className="mb-3 hidden lg:block">Admin</Label>
          {/* a scrolling row of tabs on phones, a column on wide screens */}
          <ul className="-mx-4 flex gap-1 overflow-x-auto border-b border-ink px-4 sm:mx-0 sm:px-0 lg:flex-col lg:border-b-0 lg:border-l">
            {sections.map((s) => (
              <li key={s.to} className="shrink-0">
                <NavLink
                  to={s.to}
                  end={s.end}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center px-3 text-sm lg:-ml-px lg:border-l-2 ${
                      isActive
                        ? 'border-b-2 border-ink font-semibold lg:border-b-0 lg:border-ink'
                        : 'text-ink-2 hover:text-ink lg:border-transparent'
                    }`
                  }
                >
                  {s.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function AdminHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
      <h1 className="font-expanded text-3xl font-extrabold uppercase">{title}</h1>
      {children}
    </div>
  );
}
