import { OrderStatus } from '../generated/prisma/client.js';

/** The statuses of an order that has been paid for. */
export const PAID_STATUSES = [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED];
