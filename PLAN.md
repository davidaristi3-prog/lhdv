# Plan por fases — Aplicativo web La Hora del Venado

> Hoja de ruta para construir el sistema de pedidos con IA. Cada fase es **entregable y útil por sí sola**: aunque el proyecto se detuviera, lo construido hasta ahí ya genera valor.
>
> **Versión 2** — incorpora ajustes de revisión: restricciones de WhatsApp/Meta adelantadas a Fase 0, cupo mínimo movido a Fase 2, guardrails de exactitud de la IA, y monitoreo + fallback como requisito de producción.

## Estrategia del plan

1. **Valor temprano.** Lo primero que se entrega ataca los dolores más grandes (exactitud, control de pedidos), no las funciones más vistosas.
2. **Columna vertebral antes que IA.** Primero el sistema de pedidos (la fuente de verdad). La IA se monta encima cuando ya hay dónde escribir los pedidos. Mientras tanto, el equipo opera el panel a mano.
3. **Cuidar el calendario.** No estrenar nada frágil justo antes de un pico (Navidad, Día de la Madre). Se lanza el núcleo en temporada baja, se endurece, y llega probado a la temporada alta.

**Nota sobre el esfuerzo:** los rangos son orientativos y asumen **un desarrollador trabajando de forma sostenida**. Varían mucho según dedicación semanal y experiencia. No son compromisos; son para dimensionar.

---

## Fase 0 · Cimientos

**Objetivo:** dejar listo todo lo que las demás fases necesitan.

**Qué se construye / hace:**
- Verificación del negocio y alta de la **WhatsApp Business API** con Meta (trámite que toma días; mejor empezarlo ya).
- **Decisión del número de WhatsApp** *(NUEVO)*: migrar el número actual a la API implica **perder la app normal de WhatsApp en ese número** (no se pueden usar las dos a la vez). Decidir: ¿se migra el número que ya conocen los clientes, o se saca uno nuevo? Esto bloquea la verificación con Meta.
- **Plantillas de mensajes de Meta** *(NUEVO, adelantado desde Fase 4)*: empezar a redactar y enviar a aprobación las plantillas para mensajes proactivos (listo, recordatorio, confirmación). La aprobación toma días y la ventana de 24 h las hace obligatorias.
- Provisión de infraestructura: repositorio, base de datos (PostgreSQL), hosting, cola (Redis).
- Modelo de datos definitivo y **máquina de estados del pedido**, con **idempotencia de webhooks** desde el diseño (WhatsApp y Wompi reenvían eventos → no duplicar pedidos ni pagos).
- Carga del **catálogo** en la base (productos, presentaciones, precios, adiciones).
- **Definir la frontera "pedido estándar vs. personalizado"** *(NUEVO)*: qué cierra el bot solo y qué se deriva siempre a una persona (p. ej. tortas con letras/diseños). Esta línea determina la cobertura real de la Fase 2.
- **Aviso de tratamiento de datos (Ley 1581 / Habeas Data)** *(NUEVO)*: definir el texto de consentimiento que verá el cliente, ya que se guardan datos personales e historial de chat.
- Recolección de los materiales pendientes de la propietaria: **pesos por tamaño**, ejemplos de conversaciones, su plantilla de "cómo responder" y la planilla de Excel actual.

**Entregable:** entorno funcionando + catálogo cargado + decisiones técnicas tomadas + trámites de Meta en curso.
**Depende de:** materiales de la propietaria.
**Criterio de éxito:** se puede crear un pedido de prueba en la base con su estado.
**Esfuerzo orientativo:** 1–2 semanas (en paralelo con la verificación de Meta).

---

## Fase 1 · Sistema de pedidos + panel (sin IA)

**Objetivo:** ser la **única fuente de verdad** de los pedidos y reemplazar el grupo de WhatsApp + Excel. Esta es la columna vertebral.

**Qué se construye:**
- Panel web con autenticación y **roles** (dueña, cocina, ventas, domicilios).
- Entidad `Pedido` con su **máquina de estados**.
- **Entrada manual de pedidos** (para que el panel sirva desde antes de tener el bot).
- **Importación del historial de clientes** desde el Excel actual *(NUEVO)*.
- **Tablero de cocina** (kanban por estado): "qué se produce hoy".
- Base de datos de **clientes** con historial.
- Catálogo editable (actualizar precios a inicio de año, marcar productos de temporada).

**Entregable:** un panel donde el equipo registra y sigue cada pedido de principio a fin.
**Depende de:** Fase 0.
**Criterio de éxito:** Mariana deja de usar el Excel; el equipo trabaja desde el panel.
**Esfuerzo orientativo:** 3–5 semanas.

> ⚠️ **Nota:** el éxito de esta fase es un **cambio organizacional** (que el equipo adopte el panel), no solo software. Es la parte más difícil; conviene acompañar la adopción.

> Hito importante: aquí ya se ataca el dolor de **exactitud**, incluso sin una sola línea de IA.

---

## Fase 1.5 · Pagos para pedidos manuales (opcional, desacopla valor)

**Objetivo:** cerrar el ciclo de cobro antes de tener el bot. Wompi no depende de la IA.

**Qué se construye:**
- Integración con **Wompi**: generación de link de pago para pedidos cargados manualmente.
- **Webhook de Wompi** (idempotente) → confirma el pago → mueve el pedido a "Confirmado".

**Entregable:** se cobra y se confirma sin revisar el banco a mano, aún sin bot.
**Depende de:** Fase 1.
**Nota:** si no se hace aquí, se absorbe en la Fase 3. Es un adelanto opcional.
**Esfuerzo orientativo:** 1–2 semanas.

---

## Fase 2 · IA conversacional en WhatsApp

**Objetivo:** que el asistente responda y tome pedidos solo, sonando humano, y pase a una persona lo que corresponde.

**Qué se construye:**
- Conexión de la **WhatsApp Cloud API** al backend (webhooks + cola).
- **Orquestador IA** (LLM con tool calling), con personalidad "amigable pero respetuosa" basada en la plantilla de la propietaria, y memoria por cliente.
- Herramientas: `ver_catalogo`/`buscar_producto`, `verificar_fecha`, `cotizar`, `crear_pedido`, `registrar_cliente`, `escalar_a_humano`.
- **Cupo mínimo por fecha** *(NUEVO, adelantado desde Fase 4)*: un tope de pedidos/unidades por día que `verificar_fecha` consulta, para que **el bot no sobrevenda fechas que la cocina no puede cumplir**. La agenda completa queda en Fase 4; acá va el límite duro.
- **Guardrails de exactitud** *(NUEVO)*:
  - Cero dinero/fecha/disponibilidad en texto libre — todo número sale de una tool, nunca de la redacción del modelo.
  - **Paso de confirmación estructurada obligatorio** antes de `crear_pedido`: el bot muestra resumen (producto, tamaño, adiciones, fecha, total, dirección) y el cliente confirma.
- Respuesta automática a las **FAQ** (tamaños, peso, ingredientes, letras/diseños, tiempos).
- **Handoff a humano** (reclamos, fotos de tortas malas, cotizaciones > $400k) hacia una bandeja en el panel.
- **Comportamiento fuera de horario** *(NUEVO)*: qué hace el bot cuando algo se sale de su alcance y no hay humano disponible (encolar + "te respondemos pronto").
- **Visor de conversaciones + logs** *(NUEVO)*: revisar también las conversaciones que *parecieron* exitosas, para cazar errores silenciosos. Es la única forma de medir de verdad el "% sin humano".
- **Monitoreo, alertas y fallback** *(NUEVO, requisito de producción)*: si el LLM o el backend se caen, el bot responde algo y encola en vez de quedar mudo. Un bot caído en pico = pedidos perdidos.

**Entregable:** los clientes pueden hacer un pedido estándar por WhatsApp sin intervención humana.
**Depende de:** Fase 1 (necesita dónde escribir los pedidos) + API de Meta lista + plantillas aprobadas.
**Criterio de éxito:** un porcentaje alto de pedidos estándar se completa sin que una persona escriba, **y sin sobreventa de fechas**.
**Esfuerzo orientativo:** 4–6 semanas.

> Esta es la función estrella (el deseo principal: "responder mensajes"). Por eso va sobre una base ya sólida.

---

## Fase 3 · Pagos automáticos

**Objetivo:** cerrar el ciclo del pedido sin trabajo manual de verificación. *(Si se hizo la Fase 1.5, aquí solo se conecta el cobro al flujo del bot.)*

**Qué se construye:**
- Generación de link de pago **Wompi** desde la conversación.
- **Webhook de Wompi** (idempotente) → confirma el pago automáticamente → mueve el pedido a "Confirmado" y avisa a cocina.
- Regla dura: ningún pedido pasa a producción sin pago verificado.
- Consignación a Bancolombia: el cliente sube el comprobante y queda "pendiente de confirmar" hasta validación (o se empuja a pagar por Wompi, que cierra solo).

**Entregable:** el dinero entra y el pedido avanza solo, sin revisar correos ni entrar al banco.
**Depende de:** Fases 1 y 2.
**Criterio de éxito:** se elimina la verificación manual de pagos por Wompi.
**Esfuerzo orientativo:** 2–3 semanas.

---

## Fase 4 · Domicilios, agenda y mensajes proactivos

**Objetivo:** ordenar la entrega y la capacidad, y comunicar al cliente automáticamente.

**Qué se construye:**
- Validación de **zona de domicilio** (Medellín hasta Bello; no Oriente) directamente en la conversación.
- Asignación de entrega (mensajero propio / Uber-rápido) y registro de costo de domicilio.
- **Agenda con cupo por fecha (completa)**: control real de pedidos comprometidos y bloqueo de cupo en picos. *(Amplía el cupo mínimo introducido en Fase 2.)*
- **Mensajes proactivos** ("tu pedido está listo", recordatorios) con las **plantillas ya aprobadas en Fase 0**, respetando la ventana de 24 h.

**Entregable:** el sistema sabe a dónde se entrega, cuánto cupo queda y avisa al cliente solo.
**Depende de:** Fases 1–3.
**Criterio de éxito:** se acaba el descontrol de "para qué fecha tengo pedidos".
**Esfuerzo orientativo:** 3–4 semanas.

---

## Fase 5 · Expansión: Rappi y rentabilidad

**Objetivo:** sumar el canal Rappi y darle a la dueña la visión de negocio que pidió.

**Qué se construye:**
- **Integración con Rappi** (aceptación instantánea y despacho), reflejada en el mismo panel.
- **Reportes de rentabilidad**: ingresos, costos de domicilio, márgenes, productos y clientes top, comportamiento por temporada.

**Entregable:** todos los canales en un solo lugar + tableros de "qué tan rentable es el negocio".
**Depende de:** Fases 1–4.
**Criterio de éxito:** la dueña ve su rentabilidad sin armar nada a mano.
**Esfuerzo orientativo:** 4–6 semanas (Rappi y reportes pueden ir en paralelo o partirse en 5a y 5b).

---

## Futuro · Inventario y más

**Objetivo:** cerrar el tercer dolor (inventarios) y madurar hacia el sistema operativo del negocio.

**Posible alcance:** control de insumos y stock, alertas de reposición, costeo de recetas (que mejora aún más la rentabilidad), e integraciones contables. Se aborda cuando el núcleo esté probado y estable.

---

## Calendario y temporadas (recomendación estratégica)

- **No lanzar el núcleo (Fases 1–2) en vísperas de un pico.** Lo ideal: tenerlo funcionando y endurecido **antes** de una temporada fuerte, para que el pico sea la demostración de su valor, no su bautizo de fuego.
- Las temporadas fuertes son, en orden: **Navidad** y **Día de la Madre** (con Amor y Amistad, San Valentín, Día del Padre, etc. detrás). Conviene fijar las fechas de lanzamiento mirando ese calendario.

## Riesgos y decisiones abiertas

- **Restricciones de WhatsApp/Meta** *(NUEVO)*:
  - **Ventana de 24 h:** el bot solo responde libre dentro de 24 h del último mensaje del cliente; lo proactivo exige plantillas aprobadas.
  - **Tiers de mensajería:** un número nuevo arranca limitado (~1.000 conv./día) y escala según calidad. A tener en cuenta antes de un pico.
  - **Quality rating:** bloqueos/reportes de clientes pueden degradar o **suspender el número**. Riesgo de continuidad del negocio.
  - **Costo por conversación** (Meta) + costo del LLM por mensaje: estimar antes de escalar.
- **Decisión del número de WhatsApp** *(NUEVO)*: migrar el actual (se pierde la app normal) vs. número nuevo. Bloquea Fase 0.
- **Operación y mantenimiento en producción** *(elevado a requisito)*: con un solo desarrollador, ¿qué pasa si el bot se cae un sábado de Día de la Madre? Necesita monitoreo, alertas y on-call definidos (Fase 2).
- **Materiales pendientes** (pesos, conversaciones, plantilla): bloquean la calidad de las Fases 1–2; cerrarlos en Fase 0.
- **Consignación Bancolombia**: difícil de verificar automáticamente; la ruta limpia es Wompi.
- **Rappi**: confirmar si se integra por API en Fase 5 o se maneja manual al inicio.
- **Habeas Data (Ley 1581)** *(NUEVO)*: consentimiento de tratamiento de datos y manejo del historial de chat.
- **Stack**: a definir (sugerido: Node/NestJS o Python/FastAPI + PostgreSQL + Redis + Next.js).

---

## Resumen

| Fase | Foco | Entregable clave |
|---|---|---|
| 0 | Cimientos | Entorno + catálogo + trámites Meta + plantillas |
| 1 | Pedidos + panel | Fuente de verdad (reemplaza Excel) |
| 1.5 | Pagos manuales (opcional) | Wompi para pedidos manuales |
| 2 | IA en WhatsApp | Toma de pedidos automática + cupo + guardrails |
| 3 | Pagos | Wompi cierra el ciclo |
| 4 | Domicilios y agenda | Cupo completo, zonas y avisos |
| 5 | Expansión | Rappi + rentabilidad |
| Futuro | Inventario | Sistema integral |
