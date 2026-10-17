import { messageSchema } from '@gear-store/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Notice } from '../../components/ui/Field';
import { api } from '../../lib/api';
import { AuthShell } from './AuthShell';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // read once: while the panel fades to the next page this one is still drawn, and must not see that URL
  const [token] = useState(() => params.get('token') ?? '');
  // a query, not an effect: cached per token, so a re-render or StrictMode never spends the single-use link twice
  const verify = useQuery({
    queryKey: ['verify-email', token],
    queryFn: () => api('/auth/verify-email', { method: 'POST', body: { token }, schema: messageSchema }),
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  // confirmed: straight on to signing in, with the news; the used link leaves the history
  const confirmed = verify.isSuccess ? verify.data.message : null;
  useEffect(() => {
    if (confirmed) void navigate('/sign-in', { replace: true, state: { notice: confirmed } });
  }, [confirmed, navigate]);

  return (
    <AuthShell eyebrow="Account" title="Confirm email">
      {!token && <Notice tone="error">This link is incomplete. Open it again from the email.</Notice>}
      {verify.isPending && token && <p className="text-ink-2">Confirming…</p>}
      {verify.isError && (
        <>
          <Notice tone="error">This link is invalid or has expired.</Notice>
          <p className="text-sm text-ink-2">
            Sign in with your email and password to get a new link, or{' '}
            <Link preventScrollReset to="/register" className="underline underline-offset-4">
              create the account again
            </Link>
            .
          </p>
        </>
      )}
      {verify.isSuccess && (
        <>
          <Notice tone="ok">{verify.data.message}</Notice>
          <Link
            preventScrollReset
            to="/sign-in"
            className="inline-block font-semibold underline underline-offset-4"
          >
            Sign in
          </Link>
        </>
      )}
    </AuthShell>
  );
}
