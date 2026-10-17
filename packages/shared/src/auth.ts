import { z } from 'zod';

/** Trimmed and lower-cased before validation, so "Ana@Mail.com " and "ana@mail.com" are one account. */
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const PASSWORD_MIN_LENGTH = 8;

/**
 * Length over composition (NIST SP 800-63B): at least 8 characters, no forced symbols. The upper bound
 * keeps a single request from making argon2 hash megabytes.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(128, 'Use at most 128 characters');

/** Shown under a "confirm password" field that does not repeat the new password. */
export const PASSWORDS_DIFFER = 'The passwords do not match';

/** Opaque single-use token from an email link: 32 random bytes, base64url. */
export const emailLinkTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid or expired link');

const nameSchema = z.string().trim().min(1, 'Enter your name').max(80, 'Use at most 80 characters');

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // any length is accepted at login, so a password set under an older rule still works
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const demoLoginSchema = z.object({ role: z.enum(['shopper', 'admin']) });
export type DemoLoginInput = z.infer<typeof demoLoginSchema>;

export const emailOnlySchema = z.object({ email: emailSchema });
export const tokenOnlySchema = z.object({ token: emailLinkTokenSchema });

export const resetPasswordSchema = z.object({ token: emailLinkTokenSchema, password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateProfileSchema = z.object({ name: nameSchema });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const roles = ['CUSTOMER', 'ADMIN'] as const;
export type Role = (typeof roles)[number];

export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: z.enum(roles),
  emailVerified: z.boolean(),
  isDemo: z.boolean(),
});
export type User = z.infer<typeof userSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  /** seconds until the access token expires; refresh a little before */
  expiresIn: z.number().int().positive(),
  user: userSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const messageSchema = z.object({ message: z.string() });
export type Message = z.infer<typeof messageSchema>;
