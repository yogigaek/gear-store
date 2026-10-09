import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // the web app's origin, the only one CORS lets in
  WEB_ORIGIN: z.url(),
  // signs 15-minute access tokens; at least 32 characters (openssl rand -base64 48)
  JWT_ACCESS_SECRET: z.string().min(32),
  // smtp://localhost:1025 is Mailpit in development; production uses the provider's SMTP URL
  SMTP_URL: z.url({ protocol: /^smtps?$/ }),
  MAIL_FROM: z.string().min(3).default('Rakit <no-reply@rakit.example>'),
});

export type Env = z.infer<typeof envSchema>;

// Read once at startup: a missing or malformed setting stops the API before it serves a request.
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // names and reasons only; values may be secrets
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${problems}`);
  }
  return parsed.data;
}
