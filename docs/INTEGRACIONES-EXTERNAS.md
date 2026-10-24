# Integraciones externas de CP BancaVirtual

Resumen para el requisito de **integraciones externas**: con qué sistemas se conecta la banca, por qué canal, en qué formato y cómo se protege.

| # | Sistema externo | Quién lo opera | Dirección | Protocolo / formato | Autenticación | Para qué |
|---|---|---|---|---|---|---|
| 1 | **CP Gestiones** (app administrativa) | Equipo CP Gestiones | Banca → CP y CP → Banca | REST sobre HTTPS · **JSON** | Banca→CP: `Authorization: Bearer` + `Idempotency-Key`; CP→Banca: `X-Service-Key` | Credenciales de clientes (registro/login), apertura de cuentas, trámite de gestiones, tarjetas, limpieza de clientes |
| 2 | **CreditPulse** (motor de evaluación / CORE) | Equipo CreditPulse | Banca → CORE | REST sobre HTTPS · **JSON** | `X-Api-Key` | Evaluar las solicitudes de tarjetas y créditos |
| 3 | **API de pago de servicios** (proveedor) | Proveedor externo (simulado en `proveedor-servicios-sim/`) | Banca → Proveedor | REST sobre HTTPS · **JSON o XML** (`SERVICIOS_API_FORMATO`) | `Authorization: Bearer` + `X-Api-Key` · `Idempotency-Key` | Catálogo de servicios, consulta de deuda, pago, reversa |
| 4 | **Web Push (VAPID)** | Servicios push del navegador (FCM / Apple) | Banca → navegador | Web Push (RFC 8030/8291) | Claves VAPID | Notificaciones al teléfono |

## Pago de servicios (todo por API externa)
1. El cliente elige servicio y contrato; la banca consulta el catálogo y la deuda **al proveedor** (`GET /servicios`, `POST /consultas`).
2. La banca **debita** la cuenta y registra el pago `PENDIENTE`.
3. La banca pide el cobro al proveedor (`POST /pagos`, con `Idempotency-Key` = referencia del banco, para que un reintento no cobre dos veces).
4. Aprobado → pago `APROBADO` con el número de autorización del proveedor. Rechazado o proveedor caído → la banca **devuelve el dinero** y, si el resultado fue incierto (timeout/5xx), llama a `POST /pagos/reversa`.

Contrato completo (JSON y XML): `docs/API-SERVICIOS-EXTERNA.md`.

## Contratos entre CP Gestiones y la banca
`docs/CONTRATO_API_APP_ADMINISTRATIVA.md`, `docs/API-ABONOS-PARA-CP.md`, `docs/ELIMINAR-Y-LIMPIAR-CLIENTES.md`.

## Pendiente / simulado
* El **tipo de cambio** de la pantalla "Tipo de cambio" es referencial y está fijo en el código (no consulta un proveedor).
* El proveedor de servicios es un **simulador** propio; para pasar a uno real basta con apuntar `SERVICIOS_API_URL` a la API real si respeta el contrato.
