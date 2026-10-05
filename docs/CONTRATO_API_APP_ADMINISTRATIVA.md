# Contrato de integración: BancaVirtual ⇄ App Administrativa

Versión 0.1 · Documento para compartir con el equipo de la app administrativa.

## 1. Arquitectura

```
 Cliente (web/móvil)         BancaVirtual API (NestJS)            App Administrativa
 ┌───────────────┐  JWT   ┌────────────────────────────┐ X-Service-Key ┌──────────────────┐
 │ BancaVirtual  │ ─────► │ /api/v1  (frontend de      │ ────────────► │ Backend de       │
 │ Web / App     │        │ negocio, orquesta)         │ ◄──────────── │ procesos         │
 └───────────────┘        └──────────┬─────────────────┘   (ambas      └──────────────────┘
                                     │ X-Api-Key            direcciones)
                                     ▼
                               CreditPulse (CORE de evaluación)
```

- **BancaVirtual** es la cara del cliente: pantallas, sesión del cliente, solicitudes de productos.
- **App Administrativa** es el backend de los procesos sensibles: alta de clientes, credenciales, trámite de gestiones.
- **CreditPulse** evalúa las solicitudes. Solo BancaVirtual lo consume.
- Autenticación entre las dos apps: header `X-Service-Key` con una llave compartida (una por dirección). Se guarda en `.env`, nunca en el repositorio. Producción: HTTPS obligatorio.
- Formato: JSON, UTF‑8, fechas en ISO‑8601 UTC, montos con 2 decimales. Errores: `{ "statusCode": 409, "message": "..." }`.

## 2. Lo que BancaVirtual YA expone para la app administrativa

Base URL: `http://<host>:3001/api/v1` · Header: `X-Service-Key: <SERVICE_API_KEY>` · Swagger: `/docs`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/admin/solicitudes?estado=&productoCodigo=&page=&limit=` | Bandeja de gestiones (con detalle de políticas) |
| GET | `/admin/solicitudes/{id}` | Una gestión con detalle |
| GET | `/admin/solicitudes/{id}/core` | Reconsulta la evaluación en CreditPulse (auditoría) |
| PATCH | `/admin/solicitudes/{id}/estado` | Cierra o cancela el trámite |
| GET | `/admin/clientes?page=&limit=` | Listado de clientes |
| GET | `/admin/clientes/{id}` | Cliente + cuentas |

### Estados de una gestión

`EN_EVALUACION` → `PENDIENTE_DECISION_CLIENTE` (o `RECHAZADA_POR_POLITICAS`) → `ACEPTADA` / `RECHAZADA_POR_CLIENTE` → `EMITIDA`  
`CANCELADA` la fija la app administrativa.

| Paso en pantalla del cliente | Estado |
|---|---|
| 1 Enviada · 2 En evaluación · 3 Aprobada / No aprobada | `EN_EVALUACION` → resultado |
| 4 Tu decisión | `PENDIENTE_DECISION_CLIENTE` |
| **5 En trámite** | `ACEPTADA` ← **la app administrativa trabaja aquí** |
| 6 Completada | `EMITIDA` |

### Cambiar estado (paso 5 → 6)

```http
PATCH /api/v1/admin/solicitudes/{id}/estado
X-Service-Key: <llave>
Content-Type: application/json

{ "estado": "EMITIDA", "nota": "Tarjeta lista para entrega en agencia" }
```

- `estado`: `EMITIDA` (solo desde `ACEPTADA`) o `CANCELADA` (desde `ACEPTADA`, `PENDIENTE_DECISION_CLIENTE`, `EN_EVALUACION`).
- `nota` (opcional, máx. 300): el cliente la ve como "Nota del banco".
- 409 si la transición no es válida.

## 3. Lo que la app administrativa DEBE exponer (propuesta)

BancaVirtual dejará de guardar credenciales y datos maestros del cliente: los pedirá a estos endpoints. Base URL a definir: `ADMIN_BASE_URL`. Header: `X-Service-Key: <llave de BancaVirtual>`.

### 3.1 Registro de cliente — `POST /clientes`

Request (mismos campos que hoy usa el formulario de registro):
```json
{
  "email": "ana@correo.com",
  "password": "Segura#2026",
  "primerNombre": "Ana", "primerApellido": "López",
  "dpi": "2987654320101", "nit": "1234567-8",
  "fechaNacimiento": "1995-04-12",
  "ingresosMensuales": 8000.00,
  "tipoEmpleo": "Asalariado",
  "antiguedadLaboralMeses": 24
}
```
Respuesta 201:
```json
{ "id": "uuid", "email": "...", "primerNombre": "...", "primerApellido": "...",
  "rol": "CLIENTE", "estado": "ACTIVO" }
```
Errores: 409 correo o DPI duplicado · 422 validación (DPI 13 dígitos, contraseña ≥ 8).  
La app administrativa guarda el hash de la contraseña (bcrypt/argon2) y cifra el DPI.

### 3.2 Autenticación — `POST /clientes/autenticar`
```json
{ "email": "ana@correo.com", "password": "Segura#2026" }
```
200 → los datos públicos del cliente (igual que 3.1). 401 si las credenciales son inválidas. 423 si la cuenta está bloqueada (ver §3.5).  
BancaVirtual emite su propio JWT con el `id` recibido.

### 3.3 Cambio de contraseña — `POST /clientes/{id}/password`
```json
{ "passwordActual": "...", "passwordNueva": "..." }
```
204 · 401 si la actual no coincide · 422 si no cumple la política.

### 3.4 Recuperación de contraseña
- `POST /clientes/recuperar` `{ "email": "..." }` → siempre 202 (no revela si existe); la app administrativa envía el correo con un enlace/token.
- `POST /clientes/recuperar/confirmar` `{ "token": "...", "passwordNueva": "..." }` → 204 / 400 token inválido o vencido.

### 3.5 Perfil y bloqueo
- `GET /clientes/{id}` · `PATCH /clientes/{id}` (datos financieros declarados: `ingresosMensuales`, `tipoEmpleo`, `antiguedadLaboralMeses`).
- `POST /clientes/{id}/bloquear` · `POST /clientes/{id}/desbloquear` (tras N intentos fallidos o por decisión del banco).

### 3.4 Cuentas (opcional, fase 2)
`POST /clientes/{id}/cuentas`, `GET /clientes/{id}/cuentas` si deciden que ellos también son dueños de las cuentas y saldos.

## 4. Eventos que BancaVirtual puede avisar (webhook, opcional)

Para no hacer polling, BancaVirtual puede llamar a `POST {ADMIN_BASE_URL}/eventos` con:

| `tipo` | Cuándo |
|---|---|
| `GESTION_ACEPTADA` | El cliente aceptó la oferta (entra a "En trámite") |
| `GESTION_RECHAZADA_CLIENTE` | El cliente rechazó |
| `CLIENTE_REGISTRADO` | Alta completada |

```json
{ "tipo": "GESTION_ACEPTADA", "gestionId": "uuid", "clienteId": "uuid",
  "productoCodigo": "TARJETA_CREDITO", "fecha": "2026-10-05T19:00:00Z" }
```
Mientras no exista, la app administrativa consulta `GET /admin/solicitudes?estado=ACEPTADA` cada cierto tiempo.

## 5. Seguridad

- Llaves distintas por dirección, rotables, en variables de entorno.
- HTTPS en cualquier ambiente fuera de localhost.
- Nunca se transmite la contraseña en URL ni se registra en logs.
- DPI y datos sensibles cifrados en reposo en quien sea su dueño.
- Idempotencia: `POST /clientes` debe rechazar duplicados con 409 (ya lo hace por correo/DPI).

## 6. Prueba rápida con Postman (paso 5 → 6)

1. `GET {{base}}/admin/solicitudes?estado=ACEPTADA` con `X-Service-Key` → copia el `id` de la gestión.
2. `PATCH {{base}}/admin/solicitudes/{id}/estado` con el body de §2.
3. Refresca "Gestiones en línea" en la web: el paso 6 aparece como completado.

## 7. Pendientes por acordar

- [ ] ¿Quién es la fuente de verdad de usuarios y cuentas? (recomendado: app administrativa)
- [ ] URL base y llave de cada ambiente.
- [ ] Política de contraseñas y de bloqueo.
- [ ] Estados adicionales de trámite (p. ej. `EN_TRAMITE` explícito con agente asignado).
- [ ] Monto solicitado: pendiente que el CORE lo incluya en `POST /evaluaciones`.


## Adenda: notificaciones y sesiones

### POST /api/v1/admin/notificaciones  (X-Service-Key)
Envía un mensaje del banco a la campanita del cliente.
```json
{ "titulo": "Aviso", "mensaje": "Texto", "clienteId": "<uuid, opcional>" }
```
Sin `clienteId` se envía a todos los clientes.

### Notas
- Los clientes ahora requieren sesión activa (JWT con `sid`); `X-Service-Key` no usa sesiones.
- Login: 5 contraseñas erróneas bloquean 15 min (HTTP 423). 2FA TOTP opcional por cliente.
- El trámite sigue siendo administrativo: ACEPTADA -> EMITIDA/CANCELADA por `PATCH /admin/solicitudes/:id/estado`. Al pasar una TARJETA_CREDITO a EMITIDA, BancaVirtual crea la tarjeta automáticamente y notifica al cliente.
