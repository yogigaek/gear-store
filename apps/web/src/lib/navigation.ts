/**
 * Where to go after signing in. Only same-site paths are honoured: "//evil.example" or "https://…" in the
 * query string would otherwise turn the sign-in page into an open redirect.
 */
export function safeNext(value: string | null, fallback = '/account'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}
