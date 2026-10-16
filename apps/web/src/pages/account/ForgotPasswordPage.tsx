import { emailSchema, messageSchema } from '@gear-store/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Field, Notice } from '../../components/ui/Field';
import { api } from '../../lib/api';
import { AuthShell } from './AuthShell';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [invalid, setInvalid] = useState(false);
  const send = useMutation({
    mutationFn: () =>
      api('/auth/forgot-password', { method: 'POST', body: { email }, schema: messageSchema }),
  });

  return (
    <AuthShell
      eyebrow="Account"
      title="Reset password"
      intro="Enter the email you signed up with and we will send a link to choose a new password."
    >
      {send.isSuccess ? (
        <>
          <Notice tone="ok">{send.data.message}</Notice>
          <p className="text-sm text-ink-2">The link works once and expires in 30 minutes.</p>
          {import.meta.env.DEV && (
            <p className="text-sm text-ink-2">
              Running locally: the email is in{' '}
              <a
                href="http://localhost:8025"
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline"
              >
                Mailpit (localhost:8025)
              </a>
              .
            </p>
          )}
        </>
      ) : (
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const ok = emailSchema.safeParse(email).success;
            setInvalid(!ok);
            if (ok) send.mutate();
          }}
        >
          {send.error && <Notice tone="error">{send.error.message}</Notice>}
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={invalid ? 'Enter a valid email address' : undefined}
          />
          <Button type="submit" disabled={send.isPending} className="w-full">
            {send.isPending ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
      <Link
        preventScrollReset
        to="/sign-in"
        className="block border-t border-bench pt-5 text-center text-sm underline underline-offset-4"
      >
        Back to sign in
      </Link>
    </AuthShell>
  );
}
