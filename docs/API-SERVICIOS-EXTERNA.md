# Contrato: API externa de pago de servicios

BancaVirtual ya **no cobra los servicios por su cuenta**: debita la cuenta del cliente y le pide al proveedor externo que
ejecute el pago. Esta es la API que el proveedor (o el compañero que la publique) debe exponer.

* Base: variable `SERVICIOS_API_URL` en Render (ej. `https://mi-api-servicios.onrender.com/api/v1`, sin `/` final).
* Autenticación: `Authorization: Bearer <SERVICIOS_API_KEY>` (también se envía `X-Api-Key` con la misma llave).
* Formato: **JSON o XML** (mismo contrato). El banco elige con `SERVICIOS_API_FORMATO=json|xml` (por omisión `json`) y envía `Content-Type` y `Accept` acordes. En JSON las respuestas pueden venir tal cual o envueltas en `{ "ok": true, "data": ... }`.
* **Los pagos de servicios SIEMPRE pasan por esta API externa.** Si `SERVICIOS_API_URL` está vacía, BancaVirtual no ofrece servicios ni cobra nada (ya no existe el modo simulado local).
* Proveedor simulado listo para usar: carpeta `proveedor-servicios-sim/` (ver al final).

## 1. `GET /servicios` — catálogo
```json
[ { "codigo": "LUZ_EEGSA", "nombre": "Energía eléctrica (EEGSA)", "categoria": "Energía", "referencia_etiqueta": "Número de contador (NIS)" } ]
```
BancaVirtual lo refresca cada 5 min y lo guarda en `servicios_pago`; la pantalla solo ofrece los servicios que publica el proveedor.
`codigo` ≤ 30 caracteres, `nombre` ≤ 80.

## 2. `POST /consultas` — monto adeudado (opcional)
```json
// pedido
{ "servicio": "LUZ_EEGSA", "contrato": "1234567" }
// respuesta
{ "titular": "JUAN PEREZ", "monto_adeudado": 245.50, "detalle": "Factura octubre" }
```
Si el proveedor no la ofrece (404/405/501), la web simplemente pide el monto al cliente.

## 3. `POST /pagos` — ejecutar el pago (obligatorio)
Cabecera **`Idempotency-Key: <referencia_banco>`**: reenviar la misma clave NO debe cobrar dos veces.
```json
// pedido
{ "servicio": "LUZ_EEGSA", "contrato": "1234567", "monto": 245.50, "referencia_banco": "PAG-A1B2C3D4E5F6" }
// respuesta 200
{ "estado": "APROBADO", "autorizacion": "AUT-889123" }
```
* Rechazo de negocio (contrato inexistente, monto inválido…): HTTP 4xx con `{ "message": "motivo" }` (o `estado: "RECHAZADO"`). BancaVirtual **devuelve el dinero** al cliente y le muestra el motivo.
* Error del proveedor (5xx) o sin respuesta: BancaVirtual reintenta una vez (misma clave), devuelve el dinero y llama a `/pagos/reversa`.

## 4. `POST /pagos/reversa` — anular un pago incierto (recomendado)
```json
{ "referencia_banco": "PAG-A1B2C3D4E5F6" }
```
Se llama cuando no se supo si el pago se procesó (timeout/5xx). Debe ser idempotente y no fallar si el pago no existe.

## Flujo en BancaVirtual
1. Valida cuenta y saldo y **debita** (movimiento DEBITO + pago `PENDIENTE`).
2. Llama a `POST /pagos`.
3. OK → pago `APROBADO` con `autorizacion` (se muestra en el comprobante). Falla → crédito de reverso en la cuenta, pago `REVERSADO`.

Variables opcionales: `SERVICIOS_API_NOMBRE` (texto que ve el cliente, por omisión "API-SERVICIOS"), `SERVICIOS_API_TIMEOUT_MS` (20000).

## Formato XML (equivalente)
Mismos campos y mismas rutas; cada pedido lleva una raíz según la operación (`<consulta>`, `<pago>`, `<reversa>`) y las respuestas se devuelven en XML con raíz `<servicios>`, `<consulta>`, `<respuesta>` o `<error>`.
```xml
<!-- POST /pagos  (Content-Type: application/xml) -->
<?xml version="1.0" encoding="UTF-8"?>
<pago><servicio>LUZ_EEGSA</servicio><contrato>1234567</contrato><monto>245.50</monto><referencia_banco>PAG-A1B2C3D4E5F6</referencia_banco></pago>

<!-- respuesta 200 -->
<?xml version="1.0" encoding="UTF-8"?>
<respuesta><estado>APROBADO</estado><autorizacion>AUT-889123</autorizacion></respuesta>

<!-- error de negocio: HTTP 422 -->
<?xml version="1.0" encoding="UTF-8"?>
<error><mensaje>Contrato no encontrado</mensaje></error>

<!-- GET /servicios -->
<servicios><servicio><codigo>LUZ_EEGSA</codigo><nombre>Energía eléctrica (EEGSA)</nombre><categoria>Energía</categoria><referencia_etiqueta>Número de contador (NIS)</referencia_etiqueta></servicio></servicios>
```

## Proveedor simulado (`proveedor-servicios-sim/`)
Servicio Node.js **sin dependencias** (`node server.js`) que cumple este contrato en JSON y XML. Se despliega **aparte** del banco (en Render: *New Web Service* → *Root Directory* `proveedor-servicios-sim` → *Start Command* `node server.js`).
Variables del proveedor: `PORT` (lo pone Render) y `SIM_API_KEY` (la llave que exigirá; debe ser igual a `SERVICIOS_API_KEY` del banco).
Reglas para demostrar casos: contrato con menos de 4 dígitos → 422; termina en `000` → 422 «Contrato no encontrado»; termina en `999` → 503 (el banco reversa y devuelve el dinero); `GET /pagos` lista lo que el proveedor recibió.
En el banco (Render): `SERVICIOS_API_URL=https://<tu-proveedor>.onrender.com`, `SERVICIOS_API_KEY=<misma llave>`, `SERVICIOS_API_NOMBRE=Proveedor de Servicios`, opcional `SERVICIOS_API_FORMATO=xml`.
