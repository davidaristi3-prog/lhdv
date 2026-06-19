# Configuración de WhatsApp Business API (Meta) — Fase 2

Guía del **trámite con Meta** para habilitar el bot de WhatsApp. El trámite es
administrativo (lo hace David / Mariana); el código del webhook que Meta necesita
**ya está listo y probado** en `apps/api` (`/api/whatsapp/webhook`).

> ⏱️ Varios pasos toman **días** (verificación del negocio, aprobación de
> plantillas). Conviene arrancarlos ya, aunque el resto del bot no esté.

---

## 0. Decisión previa (bloqueante): ¿qué número?

Migrar el número actual a la API **inhabilita la app normal de WhatsApp** en ese
número (no se pueden usar las dos). Opciones:

- **Número nuevo** (recomendado para empezar): permite probar sin tocar el número
  que los clientes ya conocen. Después se decide si se migra el oficial.
- **Migrar el actual**: el cliente sigue escribiendo al número de siempre, pero se
  pierde el WhatsApp normal en ese teléfono.

👉 **Mariana debe decidir esto.** El resto del trámite no avanza sin un número.

---

## 1. Cuentas

1. **Meta Business** → https://business.facebook.com — crear (o usar) la cuenta del negocio.
2. **Verificación del negocio** (Business Settings → Security Center): subir documentos
   legales del negocio. **Toma días** y es necesaria para producción / volumen.

## 2. App en Meta for Developers

1. https://developers.facebook.com → **Create App** → tipo **Business**.
2. Agregar el producto **WhatsApp**.
3. Meta da un **número de prueba** y un **token temporal (24 h)** para empezar a
   probar de inmediato, sin esperar la verificación.

## 3. Credenciales → pegar en `.env`

| Variable | Dónde se saca |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → API Setup (el del número, no el WABA) |
| `WHATSAPP_ACCESS_TOKEN` | API Setup (temporal) o token permanente (paso 7) |
| `WHATSAPP_APP_SECRET` | App → Settings → Basic → "App Secret" |
| `WHATSAPP_VERIFY_TOKEN` | **Lo inventás vos**; debe ser idéntico en `.env` y en Meta |

## 4. Configurar el webhook

En WhatsApp → **Configuration → Webhook**:

- **Callback URL:** `https://TU-DOMINIO/api/whatsapp/webhook`
- **Verify token:** el mismo valor de `WHATSAPP_VERIFY_TOKEN`
- Al guardar, Meta hace un `GET` de verificación → nuestro endpoint responde el
  *challenge* automáticamente. ✅ (ya probado)
- **Suscribirse al campo `messages`** (y `message_template_status_update` si querés
  seguimiento de plantillas).

### Exponer localhost en desarrollo

Meta necesita una URL pública (no `localhost`). Para probar en tu máquina, abrí un
túnel hacia el puerto de la API (3001):

```bash
# Cloudflare (sin cuenta, rápido):
cloudflared tunnel --url http://localhost:3001
# o ngrok:
ngrok http 3001
```

Usá la URL pública que te da el túnel + `/api/whatsapp/webhook` como Callback URL.

## 5. Límites de mensajería (tiers)

Un número nuevo arranca en **1.000 conversaciones de negocio / 24 h** y escala
automáticamente según el **volumen y la calidad** (quality rating). Tenelo en cuenta
antes de un pico: si los clientes bloquean o reportan, Meta puede degradar o
suspender el número.

## 6. Plantillas de mensajes (adelantar ya)

Los mensajes **proactivos** (fuera de la ventana de 24 h: "tu pedido está listo",
recordatorios, confirmación) requieren **plantillas aprobadas por Meta**, y la
aprobación **toma días**. Conviene redactarlas y enviarlas a revisión cuanto antes,
en WhatsApp Manager → **Message Templates**.

Plantillas iniciales sugeridas:
- **pedido_confirmado** — "Hola {{1}}, tu pedido {{2}} quedó confirmado para el {{3}}."
- **pedido_listo** — "¡{{1}}, tu pedido {{2}} ya está listo!"
- **recordatorio_entrega** — "Recordatorio: tu pedido {{1}} se entrega mañana."

## 7. Token permanente (para producción)

El token de API Setup es temporal (24 h). Para producción:

1. Business Settings → **System Users** → crear un System User (rol Admin).
2. Asignarle el activo de WhatsApp (el WABA).
3. **Generate Token** con permisos `whatsapp_business_messaging` y
   `whatsapp_business_management` → ese token (sin expiración) va en
   `WHATSAPP_ACCESS_TOKEN`.

---

## Checklist

- [ ] **Decidir el número** (nuevo vs migrar) — Mariana
- [ ] Crear/usar Meta Business + iniciar **verificación del negocio**
- [ ] Crear la App + agregar producto WhatsApp
- [ ] Copiar `PHONE_NUMBER_ID`, `APP_SECRET`, token a `.env`
- [ ] Elegir un `WHATSAPP_VERIFY_TOKEN` (mismo en `.env` y en Meta)
- [ ] Exponer la API con un túnel y configurar el **webhook** (campo `messages`)
- [ ] Redactar y enviar a aprobación las **plantillas**
- [ ] (Producción) Generar **token permanente** con System User

---

## Estado del lado del código

✅ **Listo y probado** (`apps/api/src/whatsapp/`):
- `GET /api/whatsapp/webhook` — responde el challenge de verificación.
- `POST /api/whatsapp/webhook` — valida la firma `X-Hub-Signature-256` (HMAC con el
  App Secret) y registra cada evento **una sola vez** (idempotencia por `wamid`).

⏳ **Pendiente (Fase 2 propiamente):** el orquestador de IA (LLM + tool calling) que
lee estos eventos desde la cola y responde. El webhook ya deja los eventos listos
para ese procesamiento.
