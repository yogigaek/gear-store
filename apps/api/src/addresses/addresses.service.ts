import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MAX_ADDRESSES, shippingFor, type Address, type Province } from '@gear-store/shared';
import type { z } from 'zod';
import type { addressInputSchema } from '@gear-store/shared';
import type { Address as AddressRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type AddressData = z.output<typeof addressInputSchema>;

export function toAddress(row: AddressRow): Address {
  const shipping = shippingFor(row.province as Province);
  return {
    id: row.id,
    label: row.label,
    recipient: row.recipient,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    province: row.province as Province,
    postalCode: row.postalCode,
    isDefault: row.isDefault,
    shippingFee: shipping.fee,
    shippingEta: shipping.eta,
  };
}

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<Address[]> {
    const rows = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(toAddress);
  }

  async create(userId: string, data: AddressData): Promise<Address> {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.address.count({ where: { userId } });
      if (count >= MAX_ADDRESSES) throw new ConflictException(`Save up to ${MAX_ADDRESSES} addresses`);
      // the first address is the default whether or not it was asked for
      const isDefault = data.isDefault || count === 0;
      if (isDefault)
        await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      return toAddress(await tx.address.create({ data: { ...data, isDefault, userId } }));
    });
  }

  async update(userId: string, id: string, data: AddressData): Promise<Address> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({ where: { id, userId } });
      if (!existing) throw new NotFoundException('Address not found');
      // the default can move to another address, but not be switched off leaving none
      const isDefault = data.isDefault || existing.isDefault;
      if (isDefault && !existing.isDefault) {
        await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      }
      return toAddress(await tx.address.update({ where: { id }, data: { ...data, isDefault } }));
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({ where: { id, userId } });
      if (!existing) throw new NotFoundException('Address not found');
      await tx.address.delete({ where: { id } });
      if (existing.isDefault) {
        const next = await tx.address.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }

  /** For checkout: the address must belong to this user. */
  async owned(userId: string, id: string): Promise<AddressRow> {
    const row = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Address not found');
    return row;
  }
}
