# memory.md · BancaVirtual (sistema completo)

> Documento de memoria del proyecto: explica **cómo funciona todo el sistema** y cómo se conecta con los demás sistemas del equipo.
> Mantenerlo al día cuando cambie algo. Detalle por sistema: `memory.md` dentro de la carpeta de la API y de la carpeta de la web.

## 1. Qué es
Banca en línea para clientes (proyecto final Análisis de Sistemas II). El cliente se registra, consulta cuentas, transfiere, paga
servicios y préstamos, solicita productos (tarjeta, créditos), bloquea tarjetas y ubica agencias/cajeros.

## 2. Sistemas y cómo se conectan
```
Navegador/PWA (Next.js, Vercel) ──► banca-virtual-api (NestJS, Render) ──► PostgreSQL (Neon)
                                          │      │      │
                                          │      │      └─► API externa de servicios (pago de luz, agua, tel…)  [SERVICIOS_API_URL]
                                          │      └────────► CP Gestiones (login/registro + gestiones de productos + estado de tarjetas)  [CP_GESTIONES_TOKEN]
                                          └───────────────► CreditPulse = CORE (evalúa la solicitud: semáforo VERDE/AMARILLO/ROJO)  [CORE_API_KEY]
App administrativa ───► /admin/* de la API (header X-Service-Key = SERVICE_API_KEY)
```
* **La web jamás llama a CP, CORE ni al proveedor**: todo pasa por la API (los secretos viven solo en Render).
* Producción: web https://banca-virtual-five.vercel.app · API https://bancavirtual-kp9z.onrender.com (Swagger en `/docs`) · BD Neon `db_banca_virtual`.
* Repo: GitHub `DevFernandoFajardo/BancaVirtual` (rama main). Vercel despliega solo; **Render tiene Auto-Deploy apagado → Manual Deploy → Deploy latest commit** tras cada push. Los SQL se ejecutan a mano en el SQL Editor de Neon.

## 3. Qué es local y qué va por API
| Función | Dónde vive |
|---|---|
| Login y registro de clientes | **CP Gestiones** (identifica por DPI). El admin (rol ADMIN) entra con credenciales locales |
| Cuentas, movimientos, transferencias, beneficiarios, programadas, plazo fijo, notificaciones | **Local** (Neon) |
| Solicitud de productos: evaluación | **CORE (CreditPulse)** |
| Gestión del producto aceptado (tarjeta/créditos) | **CP Gestiones** (el banco la procesa allá; BancaVirtual sincroniza estados) |
| Estado de tarjeta (bloqueo por el banco) | **CP Gestiones** → se refleja localmente |
| Préstamos: cuotas y pago | **Local** (se crean al aprobarse la gestión) |
| Pago de servicios | **API externa** (con modo simulado si no está configurada) |

## 4. Flujos clave
### 4.1 Registro / Login (100 % CP Gestiones)
Las credenciales viven **solo en CP Gestiones** (colección `clientes` de su MongoDB). Aquí NO se guarda ninguna contraseña de clientes.
* Registro: la API llama a `POST /banca/registro` de CP (correo, contraseña, DPI, fecha de nacimiento, nombre). Si CP rechaza, no se crea nada.
* Login: siempre `POST /banca/auth/login` de CP. Sirve igual para clientes creados desde la app de Banca o desde el panel de CP (agencia).
* Ficha local: tras un login/registro correcto se crea (si no existe) una **ficha local sin contraseña** (`password_hash = '!cp-gestiones'`) + cuenta de ahorro. Existe solo porque cuentas, movimientos, transferencias y solicitudes de este sistema se enlazan a un cliente local. Cualquier contraseña local antigua se borra en el siguiente login.
* Solo el ADMIN de BancaVirtual entra con contraseña local. 2FA (TOTP) y bloqueo por intentos son locales.
* El DPI de la ficha se completa si CP lo devuelve o cuando el cliente lo escribe en una solicitud (se usa para identificarlo en CP).

### 4.2 Solicitar un producto (Productos → Gestiones en línea)
1. El cliente llena el formulario (créditos piden **monto y plazo en cuotas**; la tarjeta no pide monto: el banco asigna el límite).
2. La API evalúa en el CORE y guarda la solicitud `EN_EVALUACION` (espera de demostración `EVALUACION_DEMORA_SEGUNDOS`).
3. Resultado: ROJO → `RECHAZADA_POR_POLITICAS`; si no → `PENDIENTE_DECISION_CLIENTE` y el cliente acepta o rechaza.
4. Al aceptar (`ACEPTADA`) la API registra la gestión en CP (y el perfil si no existe). La pantalla consulta CP cada ~15 s: `aprobada` → registra la aceptación; `emitida` → `EMITIDA`; `cancelada/rechazada` → `CANCELADA`.
5. **Varios productos:** el cliente puede tener varios productos a la vez y volver a pedir uno cuando el anterior ya fue completado. Solo se bloquea otra solicitud del *mismo* producto mientras haya una en curso (`EN_EVALUACION`, `PENDIENTE_DECISION_CLIENTE`, `ACEPTADA`) — índice único `ux_solicitud_vigente`.

### 4.3 Préstamos (cuotas)
* Al **aprobar/completar** una gestión de crédito (`EMITIDA`) se **define el número de cuotas**:
  - Desde CP: si CP envía `plazo_meses`/`numero_cuotas`/`cuotas`/`plazo` se usa ese valor; si no, el plazo que pidió el cliente; si no, el estándar del producto.
  - Desde la app admin: `PATCH /admin/solicitudes/:id/estado` con `{ "estado": "EMITIDA", "cuotas": 24 }`. Para un crédito, si no hay `cuotas` ni plazo pedido responde 422 "Define el número de cuotas…".
* Se crea el préstamo (`prestamos`) con su plan de cuotas (`prestamo_cuotas`, sistema francés, cuota fija en centavos, última cuota ajusta redondeo), **se desembolsa el monto** a la cuenta de ahorro del cliente y se notifica.
* Tasas de referencia: personal 18 %, vehicular 12.5 %, hipotecario 9.5 % anual; plazo máx. 60 / 84 / 300 cuotas.
* **Pago según cantidad de cuotas:** Préstamos → *Pagar cuotas* → el cliente elige cuántas (1, 3, 6, 12, todas) y la cuenta; `POST /prestamos/:id/pagar {cuentaId, cuotas}` debita el total de las próximas N cuotas pendientes (en orden), marca cuotas `PAGADA`, baja el saldo y liquida el préstamo al pagar la última. Todo en una transacción.

### 4.4 Pago de servicios (API externa)
Contrato en `docs/API-SERVICIOS-EXTERNA.md`. La API debita la cuenta (pago `PENDIENTE`), llama a `POST /pagos` del proveedor (idempotente), y marca `APROBADO` con la autorización; si falla, **revierte** el débito (`REVERSADO`). El catálogo se toma del proveedor (cache 5 min). Sin `SERVICIOS_API_URL` → modo simulado.

### 4.5 Tarjetas
Se emiten cuando la gestión de TARJETA_CREDITO se completa. El cliente puede bloquear/desbloquear; si el **banco** la bloqueó en CP (`bloqueo_origen = 'BANCO'`) el cliente no puede desbloquearla. Estado/límite/saldo se sincronizan desde CP.

### 4.5b Notificaciones push (teléfono)
Web Push + PWA. Cada aviso que se guarda en `notificaciones` también se envía como push a los dispositivos suscritos (`push_suscripciones`). La web (`public/sw.js`, `public/manifest.webmanifest`, tarjeta *Alertas en tu teléfono* en Seguridad) pide permiso y suscribe el dispositivo con la llave pública VAPID. Variables: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. iPhone: solo si se instala la web en la pantalla de inicio (iOS ≥ 16.4). Suscripciones muertas (404/410) se borran solas.

### 4.6 Agencias y cajeros
Mapa Leaflet (OpenStreetMap/CARTO/Esri) con puntos de ejemplo (`src/lib/agencias.ts`): agrupación de pines con contador, filtros (agencias/cajeros, *Abierto ahora*, servicio), búsqueda, ubicación del usuario, *Ir al más cercano*, **ruta dibujada en el mapa** (auto/a pie, vía routing.openstreetmap.de) con distancia y tiempo, horarios con abierto/cerrado, y enlace a Google/Apple Maps.

## 5. Base de datos (Neon / PostgreSQL) — ejecutar en orden
`01_esquema` → `02_solicitudes_en_evaluacion` → `03_banca_completa` → `04_cp_gestiones` → `05_prestamos_servicios` → `06_push` (todos idempotentes salvo 00 y 99).
Tablas: clientes, cuentas, movimientos, transferencias, beneficiarios, transferencias_programadas, sesiones, notificaciones, solicitudes (+cp_gestion_id, cp_estado, cp_error, monto_solicitado, plazo_meses), tarjetas (+cp_tarjeta_id, bloqueo_origen), tarjeta_movimientos, servicios_pago, pagos_servicios (+estado, autorizacion, proveedor), **prestamos**, **prestamo_cuotas**.

## 6. Variables de entorno (Render)
`DB_*`, `JWT_SECRET`, `ENCRYPTION_KEY`, `SERVICE_API_KEY`, `CORE_BASE_URL`, `CORE_API_KEY`, `CP_GESTIONES_TOKEN` (+`CP_GESTIONES_BASE_URL`), `SERVICIOS_API_URL`, `SERVICIOS_API_KEY`, `SERVICIOS_API_NOMBRE`, `SERVICIOS_API_TIMEOUT_MS`, `EVALUACION_DEMORA_SEGUNDOS`, `ALLOW_DEMO_DEPOSITS`, `CORS_ORIGINS`, `SEED_ADMIN_*`. Web (Vercel): `NEXT_PUBLIC_API_URL`.

## 7. Reglas y decisiones
* Dinero siempre en centavos enteros en el backend; transacciones con `FOR UPDATE` para saldos.
* Nada de lo externo bloquea una operación local de dinero: si CP/CORE/proveedor fallan, el error es claro y no se pierde dinero (reversos).
* Idempotency-Key aleatoria por intento hacia CP (reusar la clave con otro cuerpo la rechaza).
* Los secretos nunca van al frontend ni a GitHub. (Pendiente recomendado: rotar los secretos que se expusieron en capturas.)
* Los depósitos de demostración (`ALLOW_DEMO_DEPOSITS`) permiten tener saldo para probar.

## 8. Cómo probar rápido
1. Registrarse → ya hay cuenta de ahorro; depositar demo. 2. Productos → solicitar *Crédito personal* (monto y cuotas) → aceptar en Gestiones. 3. En CP (o `PATCH /admin/.../estado` con `cuotas`) completar la gestión → aparece el préstamo en **Préstamos** con el dinero en la cuenta. 4. Pagar 1 o varias cuotas. 5. Pagar servicios (con/ sin API externa). 6. Agencias y cajeros → *Ver ruta*.

## 9. Pendientes / ideas
Mora e intereses moratorios, pago automático de cuotas, abono extraordinario a capital, memory.md de CP Gestiones y CORE (los mantienen sus dueños).
