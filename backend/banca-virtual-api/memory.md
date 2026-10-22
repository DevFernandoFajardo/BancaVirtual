# memory.md · banca-virtual-api (NestJS)

Ver el panorama completo en el `memory.md` de la raíz del repositorio. Aquí: cómo está organizado el backend.

* **Stack:** NestJS 11, `pg` directo (sin ORM), JWT, class-validator, Swagger en `/docs`. Prefijo global `/api/v1`. `npm run build` / `npm run start:prod`.
* **Auth:** `@Auth('CLIENTE')` / `@Auth('ADMIN')`. Admin también con header `X-Service-Key`.
* **Dinero:** `common/money.util.ts` (`toCents`/`fromCents`). Transacciones: `DatabaseService.transaction(fn)`; nunca hacer consultas que puedan fallar *dentro* de una transacción (aborta todo): se leen antes.

## Módulos (`src/`)
| Módulo | Qué hace |
|---|---|
| `auth` | register/login/2FA/logout; valida contra CP (`cp-auth.service`) salvo ADMIN |
| `clientes` | perfil, DPI/NIT cifrados (`common/crypto.util`) |
| `cuentas` | cuentas, movimientos, estado de cuenta, plazo fijo, depósito demo |
| `transferencias` (+`programadas`) | transferencias entre cuentas del banco, programadas, comprobantes |
| `beneficiarios` | libreta de destinatarios |
| `servicios` | **pago de servicios por API externa** (`proveedor-servicios.client.ts`), reversos, historial, consulta de monto |
| `prestamos` | **préstamos y cuotas**: `otorgar` (plan + desembolso), `listar/detalle`, `pagar` N cuotas |
| `solicitudes` | solicitud → CORE → decisión → CP → sincronización de estados; al EMITIDA de un crédito crea el préstamo (con `cuotas`) |
| `tarjetas` | emisión, bloqueo cliente/banco, sincronización con CP |
| `cp` | `CpClient` (axios, reintento, idempotencia), `CpAuthService`, `CpGestionesService` |
| `core` | cliente del motor CreditPulse (`POST /evaluaciones`) |
| `notificaciones` | avisos en la campanita (+ mensajes del banco) |
| `seguridad` | contraseña, 2FA, sesiones |
| `admin` | `/admin/*` para la app administrativa |

## Endpoints principales
`/auth/*`, `/cuentas*`, `/transferencias*`, `/programadas*`, `/beneficiarios*`, `/servicios` (GET catálogo, `modo`, `consultar`, `pagar`, `pagos`),
`/prestamos` (GET, GET `:id`, POST `:id/pagar`), `/solicitudes` (POST, GET, `:id`, `:id/decision`), `/tarjetas*`, `/notificaciones*`, `/seguridad/*`, `/extras/tipo-cambio`,
`/admin/solicitudes` (+`:id/estado` con `cuotas`), `/admin/clientes`, `/admin/notificaciones`.

## Reglas importantes
* Aprobar un crédito exige **número de cuotas** (`cuotas` del admin, o `plazo_meses` pedido por el cliente, o el de CP).
* `ESTADOS_VIGENTES` (solicitudes.schema) = en curso; EMITIDA ya no bloquea volver a pedir el producto.
* Pago de servicio: débito → API externa → aprobado o reverso. Nunca dejar dinero debitado si el proveedor falló.
* Base de datos: scripts en la carpeta `database` de la raíz (orden en el `memory.md` de la raíz).
