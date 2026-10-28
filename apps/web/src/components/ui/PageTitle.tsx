/** The browser tab's title for a page: React 19 puts a <title> rendered anywhere into the document head. */
export function PageTitle({ children }: { children: string }) {
  return <title>{`${children} · Rakit`}</title>;
}
