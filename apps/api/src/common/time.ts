// Jakarta keeps UTC+7 all year (no daylight saving), so a fixed offset is exact
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

/** The instant as "yyyy-MM-ddTHH:mm:ss.sssZ" on the Jakarta clock (the Z is not meaningful). */
export function jakartaIso(date: Date): string {
  return new Date(date.getTime() + JAKARTA_OFFSET_MS).toISOString();
}
