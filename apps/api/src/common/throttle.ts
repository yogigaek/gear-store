/** Per visitor address, under the app-wide ceiling in app.module.ts. */
export const TEN_PER_MINUTE = { default: { limit: 10, ttl: 60_000 } };
/** The strict limit for routes that check a password or send email. */
export const FIVE_PER_MINUTE = { default: { limit: 5, ttl: 60_000 } };
