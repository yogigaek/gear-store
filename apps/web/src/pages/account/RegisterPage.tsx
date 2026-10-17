import { PASSWORD_MIN_LENGTH, PASSWORDS_DIFFER, registerSchema } from '@gear-store/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Field, Notice } from '../../components/ui/Field';
import { api, ApiError } from '../../lib/api';
import { AuthShell } from './AuthShell';

type Errors = Partial<Record<'name' | 'email' | 'password' | 'confirm', string>>;

export function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Errors>({});

  const register = useMutation({
    mutationFn: ({ name, email, password }: typeof form) =>
      api('/auth/register', { method: 'POST', body: { name, email, password } }),
    onError: (error) => {
      if (error instanceof ApiError)
        setErrors({
          name: error.fieldError('name'),
          email: error.fieldError('email'),
          password: error.fieldError('password'),
        });
    },
  });
  const resend = useMutation({
    mutationFn: () => api('/auth/resend-verification', { method: 'POST', body: { email: form.email } }),
  });

  if (register.isSuccess) {
    return (
      <AuthShell eyebrow="Account" title="Check your inbox">
        <p className="text-ink-2">
          We sent a confirmation link to <strong className="text-ink">{form.email}</strong>. Open it to finish
          creating your account. The link works for 24 hours.
        </p>
        {import.meta.env.DEV && (
          <Notice tone="ok">
            Running locally: emails do not leave this machine. Open{' '}
            <a
              href="http://localhost:8025"
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline"
            >
              Mailpit (localhost:8025)
            </a>{' '}
            to find this one and its link.
          </Notice>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Button
            variant="secondary"
            disabled={resend.isPending || resend.isSuccess}
            onClick={() => resend.mutate()}
          >
            {resend.isSuccess ? 'Link sent again' : 'Send the link again'}
          </Button>
          <Link preventScrollReset to="/sign-in" className="text-sm underline underline-offset-4">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <AuthShell
      eyebrow="Account"
      title="Create an account"
      intro="Save parts, keep your bikes in the cart across devices, and track your orders."
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          // same schema as the API, so most mistakes are caught before a round trip
          const parsed = registerSchema.safeParse(form);
          if (!parsed.success) {
            const next: Errors = {};
            for (const issue of parsed.error.issues) {
              const key = issue.path[0] as keyof Errors;
              next[key] ??= key === 'email' ? 'Enter a valid email address' : issue.message;
            }
            if (form.confirm !== form.password) next.confirm = PASSWORDS_DIFFER;
            setErrors(next);
            return;
          }
          if (form.confirm !== form.password) {
            setErrors({ confirm: PASSWORDS_DIFFER });
            return;
          }
          setErrors({});
          register.mutate(form);
        }}
      >
        {register.error && !Object.values(errors).some(Boolean) && (
          <Notice tone="error">{register.error.message}</Notice>
        )}
        <Field
          label="Name"
          autoComplete="name"
          value={form.name}
          onChange={set('name')}
          error={errors.name}
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters. A few words make a strong, memorable password.`}
        />
        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={set('confirm')}
          error={errors.confirm}
        />
        <Button type="submit" disabled={register.isPending} className="w-full">
          {register.isPending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <p className="border-t border-bench pt-5 text-center text-sm text-ink-2">
        Have an account?{' '}
        <Link preventScrollReset to="/sign-in" className="font-semibold underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
