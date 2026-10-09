import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AdminListQuery, AdminUserRow } from '@gear-store/shared';
import type { Prisma, Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminListQuery) {
    const where: Prisma.UserWhereInput = query.q
      ? {
          OR: [
            { email: { contains: query.q.toLowerCase() } },
            { name: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { orders: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map(toRow), page: query.page, pageSize: query.pageSize, total };
  }

  async setRole(actorId: string, userId: string, role: Role): Promise<AdminUserRow> {
    // an admin removing their own role could leave the store without one
    if (actorId === userId) throw new BadRequestException('You cannot change your own role');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isDemo) throw new ForbiddenException('Demo accounts keep their role');
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role },
      include: { _count: { select: { orders: true } } },
    });
    // a demotion takes effect at once: the access-token guard reads the role from the database on every request
    return toRow(updated);
  }
}

function toRow(
  u: Prisma.UserGetPayload<{ include: { _count: { select: { orders: true } } } }>,
): AdminUserRow {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    emailVerified: u.emailVerifiedAt !== null,
    isDemo: u.isDemo,
    orderCount: u._count.orders,
    createdAt: u.createdAt.toISOString(),
  };
}
