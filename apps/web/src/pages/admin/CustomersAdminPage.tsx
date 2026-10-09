import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Notice } from '../../components/ui/Field';
import { useAdminUsers, useSetRole } from '../../lib/admin';
import { useAuth } from '../../lib/auth-context';
import { formatDateTime } from '../../lib/date';
import { AdminHeading } from './AdminLayout';
import { Pager, searchClass } from './Pager';

export function CustomersAdminPage() {
  const { user: me } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1) || 1;
  const [q, setQ] = useState(params.get('q') ?? '');
  const users = useAdminUsers({ q: params.get('q') ?? undefined, page });
  const setRole = useSetRole();
  const [confirm, setConfirm] = useState<string | null>(null);

  return (
    <>
      <AdminHeading title="Customers" />
      <form
        role="search"
        className="mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          setParams(q.trim() ? { q: q.trim() } : {});
        }}
      >
        <label htmlFor="user-search" className="sr-only">
          Search by name or email
        </label>
        <input
          id="user-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name or email"
          className={searchClass}
        />
      </form>
      {(users.error ?? setRole.error) && (
        <Notice tone="error">{(users.error ?? setRole.error)!.message}</Notice>
      )}
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Customers table">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-ink text-left font-mono text-xs uppercase tracking-[0.06em] text-ink-3">
              <th className="py-2 font-normal">Account</th>
              <th className="py-2 font-normal">Joined</th>
              <th className="py-2 text-right font-normal">Orders</th>
              <th className="py-2 pl-4 font-normal">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.data?.items.map((u) => {
              const target = u.role === 'ADMIN' ? 'CUSTOMER' : 'ADMIN';
              const locked = u.isDemo || u.id === me?.id;
              return (
                <tr key={u.id} className="border-b border-bench align-top">
                  <td className="py-3">
                    {u.name}
                    {u.isDemo && <span className="ml-2 font-mono text-xs text-ink-3">demo</span>}
                    <span className="block font-mono text-xs text-ink-3">
                      {u.email}
                      {!u.emailVerified && ' · not confirmed'}
                    </span>
                  </td>
                  <td className="py-3 text-ink-2">{formatDateTime(u.createdAt)}</td>
                  <td className="tabular py-3 text-right font-mono">{u.orderCount}</td>
                  <td className="py-3 pl-4">
                    <span className="block">{u.role === 'ADMIN' ? 'Administrator' : 'Customer'}</span>
                    {!locked &&
                      (confirm === u.id ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="secondary"
                            disabled={setRole.isPending}
                            onClick={() =>
                              setRole.mutate(
                                { id: u.id, role: target },
                                { onSettled: () => setConfirm(null) },
                              )
                            }
                          >
                            {target === 'ADMIN' ? 'Yes, make admin' : 'Yes, remove admin'}
                          </Button>
                          <Button variant="ghost" onClick={() => setConfirm(null)}>
                            Cancel
                          </Button>
                        </span>
                      ) : (
                        <Button variant="ghost" onClick={() => setConfirm(u.id)}>
                          {target === 'ADMIN' ? 'Make admin' : 'Remove admin'}
                        </Button>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {users.data && (
        <Pager
          {...users.data}
          onPage={(p) => setParams({ ...(params.get('q') ? { q: params.get('q')! } : {}), page: String(p) })}
        />
      )}
    </>
  );
}
