# BancaVirtual

Proyecto final de Análisis de Sistemas II: banca virtual para clientes que consume el motor de evaluaciones **CreditPulse** (el CORE).

```
BancaVirtual/
├── banca-virtual-api/   NestJS + PostgreSQL (pg directo)   → http://localhost:3001
├── banca-virtual-web/   Next.js + Tailwind                  → http://localhost:3000
└── database/            Scripts SQL para ejecutar en pgAdmin
```

```
Navegador (web) ──► banca-virtual-api ──► CreditPulse (CORE)
                          ▲   │
App administrativa ───────┘   └──► PostgreSQL (Docker)
```

**La web nunca llama al CORE directamente.** La `X-Api-Key` del CORE vive solo en el `.env` de la API; si estuviera en el frontend, cualquiera podría verla en el navegador.

---

## 1. Base de datos (pgAdmin)

Con tu contenedor `postgres_desarrolloweb` encendido, en pgAdmin:

1. Conéctate al servidor, abre **Query Tool** sobre la base `postgres` y ejecuta `database/00_crear_base_de_datos.sql`.
2. Refresca, abre **Query Tool** sobre la nueva base `banca_virtual` y ejecuta `database/01_esquema.sql`.

El esquema es idempotente (puedes correrlo de nuevo sin perder datos). `99_reiniciar_datos_SOLO_DESARROLLO.sql` borra todo si necesitas empezar de cero.

## 2. API

```bash
cd banca-virtual-api
npm install
copy .env.example .env
```

Edita el archivo `.env` que acabas de crear:

| Variable | Qué poner |
|---|---|
| `DB_USER` / `DB_PASSWORD` / `DB_PORT` | Los de tu contenedor de PostgreSQL |
| `CORE_API_KEY` | La API key de CreditPulse (ver aviso de seguridad abajo) |
| `JWT_SECRET`, `ENCRYPTION_KEY`, `SERVICE_API_KEY` | Cambia los tres por valores aleatorios propios (comando abajo). `SERVICE_API_KEY` es la llave que usará la app administrativa. **No cambies `ENCRYPTION_KEY` después de registrar clientes**: DPI y NIT quedarían ilegibles |

Para generar cada secreto aleatorio:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

```bash
npm run start:dev
```

- Documentación interactiva (Swagger): http://localhost:3001/docs
- Estado: http://localhost:3001/api/v1/health
- Al arrancar crea el administrador inicial (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).

## 3. Web

```bash
cd banca-virtual-web
npm install
copy .env.example .env
npm run dev
```

Abre http://localhost:3000, regístrate y se te crea tu primera cuenta de ahorro. Desde la cuenta puedes hacer un **depósito de demostración** para tener saldo y probar transferencias.

---

## Flujo de solicitud de tarjeta

1. `POST /solicitudes` → la API envía los datos del cliente al CORE (`POST /evaluaciones`) y guarda el resultado con el `evaluacionId`.
2. El cliente ve el semáforo general y el detalle de cada política.
3. Si **no** es ROJO, el cliente decide: `POST /solicitudes/:id/decision` con `{ "aceptar": true | false }`.
4. Si es ROJO, la solicitud queda como `RECHAZADA_POR_POLITICAS` y no se puede aceptar.

Estados: `PENDIENTE_DECISION_CLIENTE` → `ACEPTADA` → `EMITIDA` (o `RECHAZADA_POR_CLIENTE`, `RECHAZADA_POR_POLITICAS`, `CANCELADA`).

## API para la app administrativa (tu compañero)

Autenticación: header `X-Service-Key: <SERVICE_API_KEY>` (o un JWT de un usuario con rol `ADMIN`). Base: `http://localhost:3001/api/v1`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/admin/solicitudes?estado=&productoCodigo=&page=&limit=` | Lista paginada de solicitudes |
| GET | `/admin/solicitudes/:id` | Detalle, con las políticas y el perfil SIB |
| GET | `/admin/solicitudes/:id/core` | Vuelve a consultar la evaluación original en el CORE (auditoría) |
| PATCH | `/admin/solicitudes/:id/estado` | `{ "estado": "EMITIDA" \| "CANCELADA", "nota": "..." }` |
| GET | `/admin/clientes?page=&limit=` | Clientes (DPI enmascarado) |
| GET | `/admin/clientes/:id` | Cliente con sus cuentas |

Transiciones válidas: `ACEPTADA → EMITIDA`, y `ACEPTADA` o `PENDIENTE_DECISION_CLIENTE → CANCELADA`. Cualquier otra responde `409`.

Ejemplo:

```bash
curl -H "X-Service-Key: TU_LLAVE" "http://localhost:3001/api/v1/admin/solicitudes?estado=ACEPTADA"
```

## Rutas de la API para clientes

| Método | Ruta |
|---|---|
| POST | `/auth/register`, `/auth/login` |
| GET / PATCH | `/clientes/me` |
| GET / POST | `/cuentas` (listar / abrir ahorro o monetaria) |
| GET | `/cuentas/:id`, `/cuentas/:id/movimientos`, `/cuentas/validar/:numero` |
| POST | `/cuentas/:id/deposito-demo` (solo demostración) |
| POST / GET | `/transferencias` |
| POST / GET | `/solicitudes`, `/solicitudes/:id`, `/solicitudes/:id/decision` |

---

## Seguridad: lo que ya está hecho

- Contraseñas con bcrypt; JWT con expiración; límite de intentos (rate limiting) en login y registro.
- DPI y NIT **cifrados** en la base (AES-256-GCM); el DPI se muestra siempre enmascarado.
- Transferencias en una transacción con bloqueo de filas: no se pueden generar saldos negativos ni cuentas descuadradas aunque lleguen peticiones simultáneas. La base además tiene `CHECK (saldo >= 0)`.
- Un cliente nunca puede ver ni mover cuentas o solicitudes ajenas (responde 404).
- La API key del CORE nunca sale del servidor.

## Pendiente / a tener en cuenta

- **Rota la API key del CORE**: apareció en el documento de pruebas. Pide una nueva a quien mantiene CreditPulse y ponla solo en `banca-virtual-api/.env`.
- El endpoint 4 del CORE (`variables-score`) devolvió lo mismo que el 3 en tu documento; confírmalo con quien lo mantiene.
- El token de sesión se guarda en `localStorage` (simple para el proyecto). Para producción real, una cookie `httpOnly` emitida por el servidor es más segura.
- Los depósitos de demostración se desactivan con `ALLOW_DEMO_DEPOSITS=false`.
- Las tablas se crean con scripts manuales, no con migraciones automáticas. Si cambias el esquema, agrega un script `02_...sql`.

## Publicar en App Store / Play Store

Esta versión es web responsive. Para tiendas hay dos caminos: empaquetarla con **Capacitor** (envuelve la web en una app nativa) o reescribir el cliente en Flutter/React Native reutilizando la misma API. Para un proyecto universitario lo más práctico es **TestFlight** (iOS) y **pruebas internas** (Android). La API ya está lista para cualquiera de los dos caminos.
