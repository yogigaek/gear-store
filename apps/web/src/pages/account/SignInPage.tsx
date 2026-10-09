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

  return (
    <AuthShell eyebrow="Account" title="Sign in">
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

      <section aria-labelledby="demo-title" className="space-y-3 border border-ink bg-alu-50 p-4">
        <h2 id="demo-title" className="font-mono text-xs uppercase tracking-[0.08em]">
          Just looking around?
        </h2>
        <p className="text-sm text-ink-2">
          Sign in to a shared demo account in one click. Other visitors use the same accounts, so keep
          personal details out of them.
        </p>
        {demo.error && <Notice tone="error">{demo.error.message}</Notice>}
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" disabled={demo.isPending} onClick={() => demo.mutate('shopper')}>
            Try as shopper
          </Button>
          <Button variant="secondary" disabled={demo.isPending} onClick={() => demo.mutate('admin')}>
            Try as admin
          </Button>
        </div>
      </section>
    </AuthShell>
  );
}
