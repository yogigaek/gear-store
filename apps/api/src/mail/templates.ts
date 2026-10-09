import type { Mail } from './mail.service.js';

const signature = '\n\n— Rakit (demo store, portfolio project by Muhammad Yogi)';

export function verifyEmailMail(to: string, name: string, link: string): Mail {
  return {
    to,
    subject: 'Confirm your email for Rakit',
    text: `Hi ${name},\n\nConfirm your email address to finish creating your account:\n\n${link}\n\nThe link works once and expires in 24 hours. If you did not sign up, ignore this email.${signature}`,
  };
}

export function accountExistsMail(to: string, link: string): Mail {
  return {
    to,
    subject: 'You already have a Rakit account',
    text: `Someone tried to create a Rakit account with this email address, but one already exists.\n\nIf it was you, sign in instead, or reset your password here:\n\n${link}\n\nIf it was not you, no action is needed.${signature}`,
  };
}

export function resetPasswordMail(to: string, name: string, link: string): Mail {
  return {
    to,
    subject: 'Reset your Rakit password',
    text: `Hi ${name},\n\nUse this link to choose a new password:\n\n${link}\n\nThe link works once and expires in 30 minutes. Resetting signs you out on every device. If you did not ask for this, ignore this email; your password stays the same.${signature}`,
  };
}
