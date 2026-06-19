import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { assertTransition, InvalidTransitionError, type OrderStatus } from '@lhdv/shared';
import { PrismaService } from '../prisma/prisma.service';

interface TransitionOptions {
  /** Usuario del panel que ejecuta el cambio. `null` = sistema (bot, webhook). */
  byUserId?: string | null;
  reason?: string;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cambia el estado de un pedido validando la transición contra la máquina de
   * estados compartida y registra el evento de auditoría. Todo dentro de una
   * transacción: o se hace el cambio + el evento, o no se hace nada.
   */
  async applyTransition(orderId: string, to: OrderStatus, opts: TransitionOptions = {}) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) {
        throw new NotFoundException(`Pedido ${orderId} no existe`);
      }

      const from = order.status as OrderStatus;
      try {
        assertTransition(from, to);
      } catch (err) {
        if (err instanceof InvalidTransitionError) {
          throw new BadRequestException(err.message);
        }
        throw err;
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: to },
      });

      await tx.orderStatusEvent.create({
        data: {
          orderId,
          fromStatus: from,
          toStatus: to,
          byUserId: opts.byUserId ?? null,
          reason: opts.reason ?? null,
        },
      });

      return updated;
    });
  }
}
