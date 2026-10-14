import type { OrderDetail } from '@gear-store/shared';

type Item = OrderDetail['items'][number];
type Build = OrderDetail['builds'][number];

/** An order's lines as people read them: each bike with the parts it was built from, then single parts. */
export function groupOrderLines(order: Pick<OrderDetail, 'items' | 'builds'>): {
  bikes: { build: Build; parts: Item[] }[];
  singles: Item[];
} {
  return {
    bikes: order.builds.map((build) => ({
      build,
      parts: order.items.filter((i) => i.buildId === build.id),
    })),
    singles: order.items.filter((i) => i.buildId === null),
  };
}
