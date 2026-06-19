/**
 * Seed de desarrollo — La Hora del Venado.
 *
 * Crea:
 *  - la usuaria dueña del panel,
 *  - un catálogo de EJEMPLO (placeholder — reemplazar con los datos reales de
 *    la propietaria: productos, pesos por tamaño, precios y adiciones),
 *  - un cliente y un pedido de prueba que recorre la máquina de estados
 *    (DRAFT → PENDING_CONFIRMATION → AWAITING_PAYMENT → CONFIRMED), dejando el
 *    rastro de auditoría en OrderStatusEvent y un pago aprobado.
 *
 * Cumple el criterio de éxito de la Fase 0: "se puede crear un pedido de
 * prueba en la base con su estado".
 *
 * Idempotente en desarrollo: limpia las tablas operativas antes de recrear.
 */
import { PrismaClient } from '@prisma/client';
import { assertTransition, formatCop, type OrderStatus } from '@lhdv/shared';

const prisma = new PrismaClient();

/** Aplica una transición validada + registra el evento (espejo del OrdersService). */
async function transition(
  orderId: string,
  from: OrderStatus,
  to: OrderStatus,
  reason: string,
): Promise<OrderStatus> {
  assertTransition(from, to);
  await prisma.order.update({ where: { id: orderId }, data: { status: to } });
  await prisma.orderStatusEvent.create({
    data: { orderId, fromStatus: from, toStatus: to, reason },
  });
  return to;
}

async function wipeOperationalData(): Promise<void> {
  // Orden hijo → padre para respetar las llaves foráneas.
  await prisma.orderItemAddition.deleteMany();
  await prisma.orderStatusEvent.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.conversationMessage.deleteMany();
  await prisma.addition.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.dateCapacity.deleteMany();
  await prisma.customer.deleteMany();
}

async function main(): Promise<void> {
  console.log('🌱 Sembrando datos de desarrollo...');
  await wipeOperationalData();

  // 1. Usuaria dueña del panel
  const owner = await prisma.user.upsert({
    where: { email: 'mariana@lahoradelvenado.co' },
    update: {},
    create: {
      name: 'Mariana',
      email: 'mariana@lahoradelvenado.co',
      passwordHash: 'CHANGE_ME', // TODO: hash real al implementar auth (Fase 1)
      role: 'OWNER',
    },
  });

  // 2. Catálogo de EJEMPLO — TODO: reemplazar con datos reales de la propietaria
  const torta = await prisma.product.create({
    data: {
      name: 'Torta de chocolate',
      description: 'PLACEHOLDER — reemplazar con catálogo real',
      category: 'Tortas',
      variants: {
        create: [
          { name: 'Pequeña', weightGrams: null, priceCop: 55000 },
          { name: 'Mediana', weightGrams: null, priceCop: 80000 },
          { name: 'Grande', weightGrams: null, priceCop: 120000 },
        ],
      },
    },
    include: { variants: true },
  });

  await prisma.product.create({
    data: {
      name: 'Postre de la casa',
      description: 'PLACEHOLDER — reemplazar con catálogo real',
      category: 'Postres',
      variants: { create: [{ name: 'Porción', priceCop: 18000 }] },
    },
  });

  const mensajeChocolate = await prisma.addition.create({
    data: { name: 'Mensaje en chocolate', priceCop: 8000 },
  });
  await prisma.addition.create({
    data: { name: 'Topper personalizado', priceCop: 15000 },
  });

  const mediana = torta.variants.find((v) => v.name === 'Mediana')!;

  // 3. Cliente
  const cliente = await prisma.customer.create({
    data: {
      whatsappPhone: '+573001112233',
      name: 'Cliente de prueba',
      consentAt: new Date(), // aceptó tratamiento de datos (Habeas Data)
    },
  });

  // 4. Pedido de prueba (canal MANUAL, como lo cargaría el equipo en Fase 1)
  const order = await prisma.order.create({
    data: {
      code: 'LHDV-0001',
      customerId: cliente.id,
      channel: 'MANUAL',
      status: 'DRAFT',
      isCustom: false,
      deliveryType: 'PICKUP',
      deliveryDate: new Date('2026-07-01T15:00:00-05:00'),
      createdById: owner.id,
      items: {
        create: [
          {
            productVariantId: mediana.id,
            quantity: 1,
            unitPriceCop: mediana.priceCop,
            customText: 'Feliz cumpleaños',
            additions: {
              create: [
                {
                  additionId: mensajeChocolate.id,
                  priceCop: mensajeChocolate.priceCop,
                  quantity: 1,
                },
              ],
            },
          },
        ],
      },
    },
    include: { items: { include: { additions: true } } },
  });

  // Calcular subtotal/total a partir de las líneas (snapshots de precio)
  let subtotal = 0;
  for (const item of order.items) {
    const adiciones = item.additions.reduce((acc, a) => acc + a.priceCop * a.quantity, 0);
    subtotal += item.unitPriceCop * item.quantity + adiciones;
  }
  const total = subtotal + order.deliveryCostCop;
  await prisma.order.update({
    where: { id: order.id },
    data: { subtotalCop: subtotal, totalCop: total },
  });

  // 5. Recorrer la máquina de estados
  let estado: OrderStatus = 'DRAFT';
  estado = await transition(order.id, estado, 'PENDING_CONFIRMATION', 'Se envió el resumen al cliente');
  estado = await transition(order.id, estado, 'AWAITING_PAYMENT', 'El cliente confirmó el pedido');

  // Pago verificado (regla dura: sin pago no hay producción)
  await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: 'WOMPI',
      status: 'APPROVED',
      amountCop: total,
      providerReference: 'SEED-TX-0001',
      idempotencyKey: 'seed-pago-0001',
    },
  });
  estado = await transition(order.id, estado, 'CONFIRMED', 'Pago verificado (Wompi)');

  // 6. Cupo de ejemplo para una fecha pico
  await prisma.dateCapacity.create({
    data: {
      date: new Date('2026-12-24T00:00:00-05:00'),
      maxOrders: 20,
      notes: 'Tope de Nochebuena (ejemplo)',
    },
  });

  console.log('✅ Seed completo.');
  console.log(`   Dueña:   ${owner.name} <${owner.email}>`);
  console.log(`   Pedido:  ${order.code} — estado final: ${estado}`);
  console.log(`   Total:   ${formatCop(total)}`);
}

main()
  .catch((e) => {
    console.error('❌ Error en el seed:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
