import type { Mail } from './mail.service.js';

// Every email goes out twice in one message: an HTML layout for mail apps that show it, and plain text for
// the rest (and for the tests, which read links from the text). Names come from sign-up forms, so everything
// user-supplied is escaped before it reaches the HTML.

const brand = {
  stage: '#0b0d0e',
  ink: '#15181a',
  ink2: '#3c4449',
  ink3: '#555e63',
  page: '#eceeee',
  card: '#ffffff',
  hairline: '#dfe3e4',
  signal: '#f2c230',
};
const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

const footerText = 'Rakit is a demo store, a portfolio project by Muhammad Yogi. No real orders are taken.';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

interface Layout {
  /** shown by most inboxes next to the subject; never visible in the email itself */
  preheader: string;
  eyebrow: string;
  title: string;
  /** paragraphs above the button, as plain text */
  intro: string[];
  action: { label: string; url: string };
  /** small print under the button, as plain text */
  notes: string[];
}

function html({ preheader, eyebrow, title, intro, action, notes }: Layout): string {
  const p = (text: string) =>
    `<p style="margin:0 0 16px;font:16px/1.6 ${font};color:${brand.ink2};">${escapeHtml(text)}</p>`;
  const note = (text: string) =>
    `<p style="margin:0 0 8px;font:13px/1.6 ${font};color:${brand.ink3};">${escapeHtml(text)}</p>`;
  const url = escapeHtml(action.url);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${brand.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.page};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="background:${brand.stage};padding:20px 32px;border-bottom:3px solid ${brand.signal};">
        <span style="font:800 18px/1 ${font};letter-spacing:0.12em;color:#ffffff;">RAKIT</span>
        <span style="font:12px/1 ${mono};letter-spacing:0.08em;color:${brand.signal};padding-left:10px;">E-1 · PARTS STORE</span>
      </td></tr>
      <tr><td style="background:${brand.card};padding:36px 32px 28px;">
        <p style="margin:0 0 8px;font:12px/1 ${mono};letter-spacing:0.1em;text-transform:uppercase;color:${brand.ink3};">${escapeHtml(eyebrow)}</p>
        <h1 style="margin:0 0 20px;font:800 26px/1.2 ${font};color:${brand.ink};">${escapeHtml(title)}</h1>
        ${intro.map(p).join('\n        ')}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 28px;">
          <tr><td style="background:${brand.signal};">
            <a href="${url}" style="display:inline-block;padding:14px 28px;font:700 15px/1 ${font};letter-spacing:0.04em;color:${brand.ink};text-decoration:none;">${escapeHtml(action.label)}</a>
          </td></tr>
        </table>
        <div style="border-top:1px solid ${brand.hairline};padding-top:20px;">
          ${notes.map(note).join('\n          ')}
          <p style="margin:12px 0 0;font:13px/1.6 ${font};color:${brand.ink3};">Button not working? Paste this link into your browser:<br>
          <a href="${url}" style="color:${brand.ink2};word-break:break-all;">${url}</a></p>
        </div>
      </td></tr>
      <tr><td style="padding:20px 32px;font:12px/1.6 ${font};color:${brand.ink3};text-align:center;">
        ${escapeHtml(footerText)}<br>You received this email because this address was used on Rakit.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function text({ title, intro, action, notes }: Layout): string {
  return [title, ...intro, `${action.label}:\n${action.url}`, ...notes, `— Rakit\n${footerText}`]
    .filter(Boolean)
    .join('\n\n');
}

function mail(to: string, subject: string, layout: Layout): Mail {
  return { to, subject, text: text(layout), html: html(layout) };
}

export function verifyEmailMail(to: string, name: string, link: string): Mail {
  return mail(to, 'Confirm your email for Rakit', {
    preheader: 'One click to finish creating your Rakit account.',
    eyebrow: 'Welcome to Rakit',
    title: 'Confirm your email address',
    intro: [
      `Hi ${name}, thanks for creating a Rakit account.`,
      'Confirm this email address to finish setting it up. Then you can save parts, keep your bikes in the cart across devices, and track your orders.',
    ],
    action: { label: 'Confirm email address', url: link },
    notes: [
      'This link works once and expires in 24 hours.',
      'If you did not create a Rakit account, you can ignore this email.',
    ],
  });
}

/**
 * Someone signed up again with an address that has an unconfirmed account. Whoever signed up first may not
 * own this inbox, so the only way on is to choose a password here, which also confirms the address: a
 * password set by somebody else never becomes the one that works.
 */
export function finishSignUpMail(to: string, name: string, link: string): Mail {
  return mail(to, 'Finish creating your Rakit account', {
    preheader: 'Choose your password to finish signing up.',
    eyebrow: 'Welcome back',
    title: 'Finish creating your account',
    intro: [
      `Hi ${name}, your Rakit account is waiting to be finished.`,
      'Choose your password to confirm your email and finish setting it up.',
    ],
    action: { label: 'Choose your password', url: link },
    notes: [
      'This link works once and expires in 24 hours.',
      'If you did not try to sign up, you can ignore this email.',
    ],
  });
}

export function accountExistsMail(to: string, link: string): Mail {
  return mail(to, 'You already have a Rakit account', {
    preheader: 'Someone tried to sign up with this address. Sign in or reset your password.',
    eyebrow: 'Account notice',
    title: 'You already have an account',
    intro: [
      'Someone just tried to create a Rakit account with this email address, but an account already exists.',
      'If it was you, sign in with your password, or choose a new one with the button below.',
    ],
    action: { label: 'Reset password', url: link },
    notes: [
      'This link works once and expires in 30 minutes.',
      'If it was not you, no action is needed: your account is unchanged.',
    ],
  });
}

export function resetPasswordMail(to: string, name: string, link: string): Mail {
  return mail(to, 'Reset your Rakit password', {
    preheader: 'Choose a new password for your Rakit account.',
    eyebrow: 'Password reset',
    title: 'Choose a new password',
    intro: [
      `Hi ${name}, we received a request to reset the password for your Rakit account.`,
      'Setting a new password signs you out on every device.',
    ],
    action: { label: 'Reset password', url: link },
    notes: [
      'This link works once and expires in 30 minutes.',
      'If you did not ask for this, ignore this email: your password stays the same.',
    ],
  });
}
