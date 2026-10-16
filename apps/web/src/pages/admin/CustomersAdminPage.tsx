import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
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
  // the account whose role is about to change, asked about in a dialog first
  const [confirm, setConfirm] = useState<{ id: string; name: string; role: 'ADMIN' | 'CUSTOMER' } | null>(
    null,
  );

  return (
    <>
      <AdminHeading title="Customers" />
      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.role === 'ADMIN'
            ? `Make ${confirm.name} an administrator?`
            : `Remove ${confirm?.name}'s admin role?`
        }
        confirmLabel={confirm?.role === 'ADMIN' ? 'Make admin' : 'Remove admin'}
        danger={confirm?.role === 'CUSTOMER'}
        pending={setRole.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          confirm &&
          setRole.mutate({ id: confirm.id, role: confirm.role }, { onSettled: () => setConfirm(null) })
        }
      >
        {confirm?.role === 'ADMIN'
          ? 'They can see every order and customer, and change products, prices and stock. It applies on their next request.'
          : 'They keep their account and orders, but lose the dashboard on their next request.'}
      </ConfirmDialog>
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
        <table className="stack-table w-full text-sm sm:min-w-[40rem]">
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
                  <td data-label="Orders" className="tabular py-3 text-right font-mono">
                    {u.orderCount}
                  </td>
                  <td className="py-3 pl-4">
                    <span className="block">{u.role === 'ADMIN' ? 'Administrator' : 'Customer'}</span>
                    {!locked && (
                      <Button
                        variant="ghost"
                        onClick={() => setConfirm({ id: u.id, name: u.name, role: target })}
                      >
                        {target === 'ADMIN' ? 'Make admin' : 'Remove admin'}
                      </Button>
                    )}
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
