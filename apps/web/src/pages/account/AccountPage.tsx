import {
  changePasswordSchema,
  messageSchema,
  PASSWORD_MIN_LENGTH,
  PASSWORDS_DIFFER,
  updateProfileSchema,
  userSchema,
} from '@gear-store/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Field, Notice } from '../../components/ui/Field';
import { Label } from '../../components/ui/Label';
import { PageTitle } from '../../components/ui/PageTitle';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { useWishlist } from '../../lib/queries';

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-ink py-8 lg:grid-cols-[14rem_1fr]">
      <h2 className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3">{title}</h2>
      <div className="min-w-0 max-w-md space-y-4">{children}</div>
    </section>
  );
}

export function AccountPage() {
  const { user, authed, setUser, signOut } = useAuth();
  const navigate = useNavigate();
  const wishlist = useWishlist();
  const [name, setName] = useState(user?.name ?? '');
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [confirm, setConfirm] = useState('');
  const [confirmError, setConfirmError] = useState<string>();

  const rename = useMutation({
    mutationFn: () =>
      authed((accessToken) =>
        api('/me', {
          method: 'PATCH',
          body: updateProfileSchema.parse({ name }),
          accessToken,
          schema: userSchema,
        }),
      ),
    onSuccess: setUser,
  });
  const changePassword = useMutation({
    mutationFn: () =>
      authed((accessToken) =>
        api('/me/password', {
          method: 'POST',
          body: changePasswordSchema.parse(passwords),
          accessToken,
          schema: messageSchema,
        }),
      ),
    onSuccess: () => {
      setPasswords({ currentPassword: '', newPassword: '' });
      setConfirm('');
    },
  });
  const leave = useMutation({ mutationFn: signOut, onSuccess: () => navigate('/', { replace: true }) });

  if (!user) return null;
  const passwordError = changePassword.error instanceof ApiError ? changePassword.error : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <PageTitle>Account</PageTitle>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Label>
            {user.isDemo ? 'Shared demo account' : user.role === 'ADMIN' ? 'Administrator' : 'Account'}
          </Label>
          <h1 className="font-expanded text-3xl font-extrabold uppercase">{user.name}</h1>
          <p className="font-mono text-sm text-ink-2">{user.email}</p>
        </div>
        <Button variant="secondary" disabled={leave.isPending} onClick={() => leave.mutate()}>
          Sign out
        </Button>
      </header>

      <Panel title="Orders & addresses">
        <p className="flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/orders" className="font-semibold underline underline-offset-4">
            Your orders
          </Link>
          <Link to="/account/addresses" className="font-semibold underline underline-offset-4">
            Shipping addresses
          </Link>
        </p>
      </Panel>

      <Panel title="Wishlist">
        <p className="text-ink-2">
          <span className="tabular font-mono text-ink">{wishlist.data?.length ?? '–'}</span> saved products.{' '}
          <Link to="/wishlist" className="font-semibold underline underline-offset-4">
            Open wishlist
          </Link>
        </p>
      </Panel>

      <Panel title="Profile">
        {user.isDemo ? (
          <p className="text-ink-2">
            Demo accounts are shared, so their name and password cannot be changed.
          </p>
        ) : (
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              rename.mutate();
            }}
          >
            {rename.isSuccess && <Notice tone="ok">Name saved.</Notice>}
            {rename.error && <Notice tone="error">Enter a name of 1 to 80 characters.</Notice>}
            <Field label="Name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            <Button
              type="submit"
              variant="secondary"
              disabled={rename.isPending || name.trim() === user.name}
            >
              Save name
            </Button>
          </form>
        )}
      </Panel>

      {!user.isDemo && (
        <Panel title="Password">
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const matches = confirm === passwords.newPassword;
              setConfirmError(matches ? undefined : PASSWORDS_DIFFER);
              if (matches) changePassword.mutate();
            }}
          >
            {changePassword.isSuccess && <Notice tone="ok">{changePassword.data.message}</Notice>}
            {changePassword.error && !passwordError && (
              <Notice tone="error">
                Enter your current password and a new one of at least {PASSWORD_MIN_LENGTH} characters.
              </Notice>
            )}
            {passwordError && <Notice tone="error">{passwordError.message}</Notice>}
            <Field
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={passwords.currentPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
            />
            <Field
              label="New password"
              type="password"
              autoComplete="new-password"
              value={passwords.newPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
              hint={`At least ${PASSWORD_MIN_LENGTH} characters. Other devices will be signed out.`}
            />
            <Field
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={confirmError}
            />
            <Button type="submit" variant="secondary" disabled={changePassword.isPending}>
              Change password
            </Button>
          </form>
        </Panel>
      )}
    </div>
  );
}
