# Contrato: API externa de pago de servicios

BancaVirtual ya **no cobra los servicios por su cuenta**: debita la cuenta del cliente y le pide al proveedor externo que
ejecute el pago. Esta es la API que el proveedor (o el compañero que la publique) debe exponer.

* Base: variable `SERVICIOS_API_URL` en Render (ej. `https://mi-api-servicios.onrender.com/api/v1`, sin `/` final).
* Autenticación: `Authorization: Bearer <SERVICIOS_API_KEY>` (también se envía `X-Api-Key` con la misma llave).
* Formato: JSON. Las respuestas pueden venir tal cual o envueltas en `{ "ok": true, "data": ... }`.
* Si `SERVICIOS_API_URL` está vacía, BancaVirtual funciona en **modo simulado** (catálogo local de la base de datos).

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
