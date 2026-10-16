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

  // the quickest way in for someone only looking around: a shared account, one click
  const demoPanel = (
    <div aria-labelledby="demo-title" role="group" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="demo-title" className="font-mono text-xs uppercase tracking-[0.08em] text-ink">
          Try the demo
        </h2>
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-3">No sign-up</span>
      </div>
      {demo.error && <Notice tone="error">{demo.error.message}</Notice>}
      <div className="grid gap-2">
        {(
          [
            ['shopper', 'Shopper', 'Build, buy, track orders'],
            ['admin', 'Admin', 'Dashboard, read-only'],
          ] as const
        ).map(([role, action, detail]) => (
          <button
            key={role}
            type="button"
            disabled={demo.isPending}
            onClick={() => demo.mutate(role)}
            // the name a screen reader hears contains the visible word, and says what the button does
            aria-label={`Try as ${role}: ${detail.toLowerCase()}`}
            className="group flex min-h-14 items-center justify-between gap-3 border border-bench-strong px-4 py-2.5 text-left transition-colors hover:border-signal disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold uppercase tracking-[0.06em]">
                {demo.isPending && demo.variables === role ? 'Signing in…' : action}
              </span>
              <span className="block font-mono text-xs text-ink-3">{detail}</span>
            </span>
            <span aria-hidden="true" className="text-ink-3 transition-colors group-hover:text-signal">
              →
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-3">Shared with every visitor, so keep personal details out of it.</p>
    </div>
  );

  return (
    <AuthShell eyebrow="Account" title="Sign in" intro="Welcome back to Rakit." lead={demoPanel}>
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
        <div className="-mt-1 text-right">
          <Link
            preventScrollReset
            to="/forgot-password"
            className="text-sm text-ink-2 underline underline-offset-4 hover:text-ink"
          >
            Forgot password?
          </Link>
        </div>
        <Button type="submit" disabled={login.isPending} className="w-full">
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="border-t border-bench pt-5 text-center text-sm text-ink-2">
        New here?{' '}
        <Link
          preventScrollReset
          to={`/register${params.size ? `?${params}` : ''}`}
          className="font-semibold underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
