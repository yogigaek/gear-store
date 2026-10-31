import { z } from 'zod';
import { loadDotEnv } from './dotenv.js';

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
  // Midtrans server key (sandbox keys start with "SB-Mid-server-"); signs webhook checks and API calls
  MIDTRANS_SERVER_KEY: z.string().min(10),
  MIDTRANS_PRODUCTION: z.stringbool().default(false),
  // how many proxies sit in front of the API; req.ip (rate limits) must be the visitor, not the last proxy
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  // headers that carry the visitor address, set by the hosting itself (see common/client-ip.ts), comma-separated
  CLIENT_IP_HEADERS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean),
    ),
});

// the values in .env.example: a production copied from it would sign tokens and check webhooks with public keys
const EXAMPLE_JWT_ACCESS_SECRET = 'change-me-to-at-least-32-random-characters';
const EXAMPLE_MIDTRANS_SERVER_KEY = 'SB-Mid-server-REPLACE_ME';
const isExample = (value: string, example: string) =>
  value.trim().toLowerCase().startsWith(example.toLowerCase());

const checkedEnvSchema = envSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  const refuse = (path: keyof typeof env, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });
  if (isExample(env.JWT_ACCESS_SECRET, EXAMPLE_JWT_ACCESS_SECRET))
    refuse('JWT_ACCESS_SECRET', 'still the example value from .env.example');
  if (isExample(env.MIDTRANS_SERVER_KEY, EXAMPLE_MIDTRANS_SERVER_KEY))
    refuse('MIDTRANS_SERVER_KEY', 'still the example value from .env.example');
  const prefix = env.MIDTRANS_PRODUCTION ? 'Mid-server-' : 'SB-Mid-server-';
  if (!env.MIDTRANS_SERVER_KEY.startsWith(prefix))
    refuse(
      'MIDTRANS_SERVER_KEY',
      `must start with ${prefix} when MIDTRANS_PRODUCTION is ${env.MIDTRANS_PRODUCTION}`,
    );
});

export type Env = z.infer<typeof envSchema>;

// Read once at startup: a missing or malformed setting stops the API before it serves a request.
export function loadEnv(source?: NodeJS.ProcessEnv): Env {
  if (!source) {
    loadDotEnv();
    source = process.env;
  }
  const parsed = checkedEnvSchema.safeParse(source);
  if (!parsed.success) {
    // names and reasons only; values may be secrets
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${problems}`);
  }
  return parsed.data;
}
