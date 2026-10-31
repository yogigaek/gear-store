import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { paymentMethodLabel, type OrderDetail } from '@gear-store/shared';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { OrderStatus, type Prisma, RefundStatus } from '../generated/prisma/client.js';
import { jakartaIso } from '../common/time.js';
import { OrdersService } from '../orders/orders.service.js';
import { isUniqueViolation } from '../prisma/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  MidtransClient,
  MidtransError,
  midtransStatusSchema,
  type MidtransStatus,
} from './midtrans.client.js';
import { signatureValid } from './signature.js';

export type Outcome =
  | 'paid'
  | 'pending'
  | 'closed'
  | 'duplicate'
  | 'paid-after-close'
  | 'amount-mismatch'
  | 'unknown-order'
  | 'ignored';

/** "yyyy-MM-dd HH:mm:ss +0700", the format Midtrans expects for expiry.start_time */
function jakartaTimestamp(date: Date): string {
  const j = jakartaIso(date);
  return `${j.slice(0, 10)} ${j.slice(11, 19)} +0700`;
}

/** Midtrans refuses the server's key: payments are not set up here, which retrying will not change */
function paymentsNotSetUp() {
  return new ServiceUnavailableException({
    statusCode: 503,
    message: 'Online payment is not set up on this server yet. The order is saved and waits for payment.',
    code: 'PAYMENTS_NOT_SET_UP',
  });
}

/** Midtrans out of reach or failing: a retry shortly may work */
function paymentsUnavailable() {
  return new ServiceUnavailableException({
    statusCode: 503,
    message: 'The payment provider is not responding. Try again in a minute.',
    code: 'PAYMENTS_UNAVAILABLE',
  });
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly midtrans: MidtransClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** The Midtrans payment page for an order, created on first use and reused afterwards. */
  async start(userId: string, number: string): Promise<{ redirectUrl: string }> {
    await this.orders.expireOverdue();
    const order = await this.prisma.order.findFirst({
      where: { number, userId },
      include: { items: true, payment: true, user: { select: { email: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.PENDING_PAYMENT)
      throw new ConflictException('This order is no longer waiting for payment');
    if (order.payment?.redirectUrl) return { redirectUrl: order.payment.redirectUrl };

    const minutesLeft = Math.max(1, Math.floor((order.paymentExpiresAt.getTime() - Date.now()) / 60_000));
    let snap: { redirect_url: string };
    try {
      snap = await this.midtrans.createSnapTransaction({
        // the amounts below come from the order row, which the database checks add up
        transaction_details: { order_id: order.number, gross_amount: order.total },
        item_details: [
          ...order.items.map((i) => ({
            id: i.slug.slice(0, 50),
            price: i.unitPrice,
            quantity: i.quantity,
            name: `${i.name}${i.colorLabel ? ` (${i.colorLabel})` : ''}`.slice(0, 50),
          })),
          { id: 'shipping', price: order.shippingFee, quantity: 1, name: 'Shipping' },
        ],
        customer_details: {
          first_name: order.shipRecipient.slice(0, 50),
          email: order.user.email,
          phone: order.shipPhone,
        },
        expiry: { start_time: jakartaTimestamp(new Date()), unit: 'minute', duration: minutesLeft },
        // Midtrans adds ?order_id=…; the page works without a web session, as after paying in the phone app
        callbacks: { finish: `${this.env.WEB_ORIGIN}/payment-done` },
      });
    } catch (error) {
      this.logger.error(`Creating the Midtrans transaction for ${order.number} failed: ${String(error)}`);
      if (error instanceof MidtransError && error.keyRefused) throw paymentsNotSetUp();
      throw paymentsUnavailable();
    }

    try {
      await this.prisma.payment.create({
        data: { orderId: order.id, redirectUrl: snap.redirect_url, grossAmount: order.total },
      });
    } catch (error) {
      // two "Pay now" clicks at once: keep whichever link was saved first
      if (!isUniqueViolation(error)) throw error;
      const saved = await this.prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } });
      return { redirectUrl: saved.redirectUrl ?? snap.redirect_url };
    }
    return { redirectUrl: snap.redirect_url };
  }

  /** Webhook from Midtrans. A bad signature is refused; everything else is recorded and acknowledged. */
  async notification(payload: unknown): Promise<Outcome> {
    const parsed = midtransStatusSchema.safeParse(payload);
    if (!parsed.success) {
      await this.record(payload, null, false, 'ignored');
      throw new UnauthorizedException('Invalid notification');
    }
    if (!signatureValid(parsed.data, this.env.MIDTRANS_SERVER_KEY)) {
      await this.record(payload, parsed.data, false, 'ignored');
      this.logger.warn(`Rejected a notification with a bad signature for ${parsed.data.order_id}`);
      throw new UnauthorizedException('Invalid signature');
    }
    const outcome = await this.apply(parsed.data);
    await this.record(payload, parsed.data, true, outcome);
    return outcome;
  }

  /**
   * Asks Midtrans for the order's current status and applies it. Needed where webhooks cannot arrive
   * (localhost), and handy when a buyer comes back from the payment page before the webhook does.
   */
  async refresh(userId: string, number: string): Promise<OrderDetail> {
    const order = await this.prisma.order.findFirst({ where: { number, userId }, select: { id: true } });
    if (!order) throw new NotFoundException('Order not found');
    try {
      const status = await this.midtrans.getStatus(number);
      if (status && signatureValid(status, this.env.MIDTRANS_SERVER_KEY)) {
        const outcome = await this.apply(status);
        // the order page asks every minute while a payment is open: only a pull that moved something is
        // worth a row in the audit table (every webhook call is still recorded)
        if (outcome !== 'pending' && outcome !== 'duplicate')
          await this.record(status, status, true, outcome);
      }
    } catch (error) {
      if (!(error instanceof MidtransError)) throw error;
      this.logger.warn(`Status check for ${number} failed: ${error.message}`);
      // nothing can have been paid through a key Midtrans refuses: the order stands as it is
      if (error.keyRefused) return this.orders.detail(userId, number);
      throw paymentsUnavailable();
    }
    return this.orders.detail(userId, number);
  }

  /** Every transition is guarded by the current status, so replays and late or out-of-order messages are harmless. */
  private async apply(status: MidtransStatus): Promise<Outcome> {
    const order = await this.prisma.order.findUnique({
      where: { number: status.order_id },
      select: { id: true, number: true, total: true },
    });
    if (!order) return 'unknown-order';

    const amount = Number(status.gross_amount);
    if (!Number.isFinite(amount) || Math.round(amount) !== order.total) {
      this.logger.error(
        `Amount mismatch on ${order.number}: Midtrans ${status.gross_amount}, order ${order.total}`,
      );
      return 'amount-mismatch';
    }

    await this.prisma.payment.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        grossAmount: order.total,
        transactionId: status.transaction_id,
        transactionStatus: status.transaction_status,
        paymentType: status.payment_type,
      },
      update: {
        transactionId: status.transaction_id,
        transactionStatus: status.transaction_status,
        paymentType: status.payment_type,
      },
    });

    const s = status.transaction_status;
    const fraudOk = status.fraud_status === undefined || status.fraud_status === 'accept';
    if (s === 'settlement' || (s === 'capture' && fraudOk))
      return this.markPaid(order.id, status.payment_type);
    if (s === 'pending') return 'pending';
    if (s === 'expire' || s === 'cancel' || s === 'deny' || s === 'failure') {
      const closed = await this.prisma.$transaction((tx) =>
        this.orders.close(
          tx,
          order.id,
          s === 'expire' ? 'EXPIRED' : 'CANCELLED',
          s === 'expire'
            ? 'Payment time ran out. The items went back on sale.'
            : 'The payment was declined or cancelled.',
        ),
      );
      return closed ? 'closed' : 'duplicate';
    }
    return 'ignored';
  }

  private async markPaid(orderId: string, method: string | undefined): Promise<Outcome> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const moved = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.PENDING_PAYMENT },
        data: { status: OrderStatus.PAID, paidAt: now },
      });
      if (moved.count === 1) {
        const via = method ? ` via ${paymentMethodLabel(method)}` : '';
        await tx.orderEvent.create({
          data: { orderId, status: OrderStatus.PAID, note: `Payment received${via}.` },
        });
        return 'paid' as const;
      }
      const current = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { status: true, number: true },
      });
      if (current.status !== OrderStatus.CANCELLED && current.status !== OrderStatus.EXPIRED)
        return 'duplicate' as const;
      // money arrived for an order whose stock was already released: flag it for a refund, never resell silently.
      // Flagged once: a repeated notification finds the flag already set.
      const flagged = await tx.order.updateMany({
        where: { id: orderId, refundStatus: RefundStatus.NONE },
        data: { refundStatus: RefundStatus.NEEDED },
      });
      if (flagged.count === 0) return 'duplicate' as const;
      this.logger.error(`Payment received for closed order ${current.number}; refund needed`);
      await tx.orderEvent.create({
        data: {
          orderId,
          status: current.status,
          note: 'Payment received after the order closed. It will be refunded.',
        },
      });
      return 'paid-after-close' as const;
    });
  }

  private async record(
    payload: unknown,
    status: MidtransStatus | null,
    valid: boolean,
    outcome: Outcome,
  ): Promise<void> {
    await this.prisma.paymentNotification.create({
      data: {
        orderNumber: status?.order_id ?? 'unknown',
        transactionId: status?.transaction_id,
        transactionStatus: status?.transaction_status,
        signatureValid: valid,
        outcome,
        // a forged or malformed call keeps only a short excerpt, so junk cannot fill the database
        payload: (valid
          ? (payload ?? {})
          : { excerpt: JSON.stringify(payload ?? null).slice(0, 500) }) as Prisma.InputJsonValue,
      },
    });
  }
}
