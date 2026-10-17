import { messageSchema, PASSWORD_MIN_LENGTH, PASSWORDS_DIFFER, passwordSchema } from '@gear-store/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Field, Notice } from '../../components/ui/Field';
import { api } from '../../lib/api';
import { AuthShell } from './AuthShell';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string>();
  const [confirmError, setConfirmError] = useState<string>();
  const reset = useMutation({
    mutationFn: () =>
      api('/auth/reset-password', { method: 'POST', body: { token, password }, schema: messageSchema }),
  });

  if (reset.isSuccess) {
    return (
      <AuthShell eyebrow="Account" title="Password changed">
        <Notice tone="ok">{reset.data.message} Every other device has been signed out.</Notice>
        <Link
          preventScrollReset
          to="/sign-in"
          className="inline-block font-semibold underline underline-offset-4"
        >
          Sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Account" title="Choose a new password">
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = passwordSchema.safeParse(password);
          const matches = confirm === password;
          setError(parsed.success ? undefined : parsed.error.issues[0]?.message);
          setConfirmError(matches ? undefined : PASSWORDS_DIFFER);
          if (parsed.success && matches) reset.mutate();
        }}
      >
        {!token && <Notice tone="error">This link is incomplete. Open it again from the email.</Notice>}
        {reset.error && (
          <Notice tone="error">
            {reset.error.message}{' '}
            <Link preventScrollReset to="/forgot-password" className="font-semibold underline">
              Get a new link
            </Link>
          </Notice>
        )}
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        />
        <Field
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={confirmError}
        />
        <Button type="submit" disabled={!token || reset.isPending} className="w-full">
          {reset.isPending ? 'Saving…' : 'Set new password'}
        </Button>
      </form>
    </AuthShell>
  );
}
