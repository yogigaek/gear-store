import { messageSchema } from '@gear-store/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Notice } from '../../components/ui/Field';
import { api } from '../../lib/api';
import { AuthShell } from './AuthShell';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  // a query, not an effect: cached per token, so a re-render or StrictMode never spends the single-use link twice
  const verify = useQuery({
    queryKey: ['verify-email', token],
    queryFn: () => api('/auth/verify-email', { method: 'POST', body: { token }, schema: messageSchema }),
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  return (
    <AuthShell eyebrow="Account" title="Confirm email">
      {!token && <Notice tone="error">This link is incomplete. Open it again from the email.</Notice>}
      {verify.isPending && token && <p className="text-ink-2">Confirming…</p>}
      {verify.isError && (
        <>
          <Notice tone="error">This link is invalid or has expired.</Notice>
          <p className="text-sm text-ink-2">
            Sign in with your email and password to get a new link, or{' '}
            <Link to="/register" className="underline underline-offset-4">
              create the account again
            </Link>
            .
          </p>
        </>
      )}
      {verify.isSuccess && (
        <>
          <Notice tone="ok">{verify.data.message}</Notice>
          <Link to="/sign-in" className="inline-block font-semibold underline underline-offset-4">
            Sign in
          </Link>
        </>
      )}
    </AuthShell>
  );
}
