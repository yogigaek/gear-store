const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
});

/** "9 Oct 2026, 14:05 WIB": the store runs on Jakarta time whatever the visitor's clock says. */
export function formatDateTime(iso: string): string {
  return `${dateTime.format(new Date(iso))} WIB`;
}
