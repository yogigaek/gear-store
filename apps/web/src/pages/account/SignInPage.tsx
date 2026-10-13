import { loginSchema } from '@gear-store/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Field, Notice } from '../../components/ui/Field';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { safeNext } from '../../lib/navigation';
import { AuthShell } from './AuthShell';

export function SignInPage() {
  const { signIn, signInDemo } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () => signIn(loginSchema.parse({ email, password })),
    onSuccess: () => navigate(next, { replace: true }),
  });
  const demo = useMutation({
    mutationFn: (role: 'shopper' | 'admin') => signInDemo(role),
    onSuccess: () => navigate(next, { replace: true }),
  });
  const resend = useMutation({
    mutationFn: () => api('/auth/resend-verification', { method: 'POST', body: { email } }),
  });

  const error = login.error instanceof ApiError ? login.error : null;
  const unverified = error?.code === 'EMAIL_NOT_VERIFIED';

  // on the dark scene panel: the quickest way in for someone only looking around
  const demoPanel = (
    <div aria-labelledby="demo-title" role="group" className="space-y-4">
      <div className="space-y-1">
        <h2 id="demo-title" className="font-mono text-xs uppercase tracking-[0.08em] text-alu-50">
          Explore without an account
        </h2>
        <p className="max-w-[52ch] text-sm text-bench">
          One click signs you in to a shared demo account. Other visitors use the same accounts, so keep
          personal details out of them.
        </p>
      </div>
      {demo.error && <Notice tone="error">{demo.error.message}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ['shopper', 'Try as shopper', 'The store as a signed-in customer'],
            ['admin', 'Try as admin', 'The dashboard, read-only'],
          ] as const
        ).map(([role, action, detail]) => (
          <button
            key={role}
            type="button"
            disabled={demo.isPending}
            onClick={() => demo.mutate(role)}
            className="group flex min-h-16 flex-col items-start justify-center border border-alu-50 px-4 py-3 text-left hover:bg-alu-50 hover:text-ink disabled:cursor-not-allowed disabled:border-ink-3 disabled:text-ink-3"
          >
            <span className="text-sm font-semibold uppercase tracking-[0.06em]">{action}</span>
            <span className="font-mono text-xs text-bench group-hover:text-ink-2">{detail}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <AuthShell eyebrow="Account" title="Sign in" aside={demoPanel}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate();
        }}
      >
        {error && !unverified && <Notice tone="error">{error.message}</Notice>}
        {login.error && !error && (
          <Notice tone="error">Enter a valid email address and your password.</Notice>
        )}
        {unverified && (
          <Notice tone="error">
            {error.message}{' '}
            {resend.isSuccess ? (
              'A new link is on its way.'
            ) : (
              <button type="button" className="font-semibold underline" onClick={() => resend.mutate()}>
                Send the link again
              </button>
            )}
          </Notice>
        )}
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="submit" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
          <Link to="/forgot-password" className="text-sm underline underline-offset-4">
            Forgot password?
          </Link>
        </div>
      </form>

      <p className="text-sm text-ink-2">
        New here?{' '}
        <Link
          to={`/register${params.size ? `?${params}` : ''}`}
          className="font-semibold underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
