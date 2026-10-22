# Abonos a cuentas de BancaVirtual (para CP Gestiones: pago de planillas)

Las cuentas de ahorro/monetaria del cliente viven en BancaVirtual. Para que un pago de planilla (u otro depósito) se vea en la app,
CP Gestiones debe **avisar a BancaVirtual** cada vez que paga. BancaVirtual suma el saldo, crea el movimiento y manda la notificación (campanita + push al teléfono).

`POST https://bancavirtual-kp9z.onrender.com/api/v1/admin/abonos`

Cabeceras: `X-Service-Key: <SERVICE_API_KEY de Render>` · `Content-Type: application/json`

```json
{
  "cuentaNumero": "1234567890",
  "monto": 2500.50,
  "concepto": "Pago de planilla Octubre 2026 · Empresa X",
  "referencia": "PLA-2026-10-000123",
  "origen": "CP-GESTIONES-PLANILLAS"
}
```
* `cuentaNumero`: número de la cuenta del cliente en BancaVirtual (ahorro o monetaria). **Alternativa:** en vez de `cuentaNumero`, enviar `dpi` (13 dígitos) y opcional `tipoCuenta` (`AHORRO` por omisión, o `MONETARIA`).
* `referencia`: id ÚNICO de ese pago en CP (6-64 caracteres). Si se reenvía la misma, **no se acredita otra vez** (responde `duplicado: true`). Úsese un id por cada persona pagada.
* Respuesta 200: `{ "ok": true, "duplicado": false, "cuenta": "1234567890", "monto": 2500.5, "saldoDespues": 2600.5 }`
* Errores: 404 cuenta no encontrada · 422 cuenta no apta (plazo fijo/bloqueada) · 400/422 datos inválidos · 401 llave incorrecta.

Prueba rápida (PowerShell):
```powershell
$h = @{ "X-Service-Key" = "LA_LLAVE" }
$b = '{"cuentaNumero":"1234567890","monto":10,"concepto":"Prueba planilla","referencia":"PRUEBA-0001"}'
Invoke-RestMethod -Method Post -Uri "https://bancavirtual-kp9z.onrender.com/api/v1/admin/abonos" -Headers $h -ContentType "application/json" -Body $b
```

---

# Cuentas: CP las abre y las registra en BancaVirtual (enlace por DPI)

BancaVirtual **ya no crea cuentas** (ni al registrarse ni desde la app). Cuando CP abre una cuenta de ahorro o monetaria, debe registrarla aquí:

`POST https://bancavirtual-kp9z.onrender.com/api/v1/admin/cuentas`  (cabecera `X-Service-Key`)

```json
{
  "dpi": "1234567890123",
  "correo": "cliente@correo.com",
  "tipo": "AHORRO",
  "numero": "2123456789",
  "alias": "Cuenta de ahorro",
  "nombre": "Ana",
  "apellido": "López"
}
```
* `tipo`: `AHORRO` o `MONETARIA`. Un cliente (DPI) tiene como máximo una de cada tipo.
* `numero`: el número que CP le asignó (6-12 dígitos). Si se omite, BancaVirtual genera uno.
* `correo`: el correo con el que el cliente inicia sesión. Si el cliente aún no ha entrado a la banca, se crea su ficha con ese correo y DPI, y al iniciar sesión ya ve sus cuentas.
* `nombre`/`apellido`: opcionales.
* Idempotente: si ya existe una cuenta de ese tipo para el DPI, responde la existente (`"creada": false`).
* Respuesta 200: `{ "ok": true, "creada": true, "cuenta": { "id": "...", "numero": "2123456789", "tipo": "AHORRO", "saldo": 0 } }`
* Errores: 409 número ya existe o correo de otro DPI · 400 datos inválidos · 401 llave incorrecta.

Orden recomendado para CP: abrir la cuenta → `POST /admin/cuentas` → (para planillas/depósitos) `POST /admin/abonos` con ese `cuentaNumero`.
