/**
 * Where to go after signing in. Only same-site paths are honoured: "//evil.example" or "https://…" in the
 * query string would otherwise turn the sign-in page into an open redirect.
 */
export function safeNext(value: string | null, fallback = '/account'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  // browsers read "\" as "/" and drop tabs and newlines, so "/\t/evil.example" would also leave the site
  for (const c of value) if (c === '\\' || c <= '\u001f' || c === '\u007f') return fallback;
  return value;
}

/** Where a signed-in visitor lands: the page that asked for the sign-in, else the dashboard or the account. */
export function afterSignIn(role: 'ADMIN' | 'CUSTOMER', next: string | null): string {
  return safeNext(next, role === 'ADMIN' ? '/admin' : '/account');
}

/** the sign-in page, set to come back to `path` (its query included) afterwards */
export function signInPath(path: string): string {
  return `/sign-in?next=${encodeURIComponent(path)}`;
}
