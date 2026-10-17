/**
 * Where to go after signing in. Only same-site paths are honoured: "//evil.example" or "https://…" in the
 * query string would otherwise turn the sign-in page into an open redirect.
 */
export function safeNext(value: string | null, fallback = '/account'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}

/** Where a signed-in visitor lands: the page that asked for the sign-in, else the dashboard or the account. */
export function afterSignIn(role: 'ADMIN' | 'CUSTOMER', next: string | null): string {
  return safeNext(next, role === 'ADMIN' ? '/admin' : '/account');
}
