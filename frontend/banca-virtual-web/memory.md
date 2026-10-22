# memory.md · banca-virtual-web (Next.js)

Ver el panorama completo en el `memory.md` de la raíz del repositorio.

* **Stack:** Next.js (App Router, TypeScript), Tailwind, Leaflet, jsPDF. Se despliega en Vercel. Variable: `NEXT_PUBLIC_API_URL`.
* **Sesión:** token en `localStorage` (`lib/session.ts`); `AuthGuard` protege `(banca)/*`; `lib/api.ts` envuelve `fetch` (errores → `errorMessage`).
* **Servicios HTTP:** `services/banca.service.ts` (servicios, préstamos, tarjetas…), `services/solicitudes`, `services/cuentas`, `services/auth`, `services/perfil`.

## Pantallas (`src/app/(banca)`)
| Ruta | Qué muestra |
|---|---|
| `/dashboard` | resumen de cuentas |
| `/cuentas/[id]` | movimientos, estado de cuenta, plazo fijo |
| `/transferencias` | transferir, beneficiarios, programadas |
| `/servicios` | pagar servicios (badge del proveedor, *Consultar monto*, comprobante con autorización) |
| `/tarjetas` | tarjetas, bloquear/desbloquear (el bloqueo del banco no se puede desbloquear) |
| `/productos` | catálogo y formulario flotante (créditos piden monto y **cuotas**) |
| `/gestiones` | seguimiento de solicitudes (refresca solo); acceso a *Mi préstamo* |
| `/prestamos` | **Mis préstamos** (avance, próxima cuota, tabla de cuotas, **Pagar cuotas** por cantidad) + simulador |
| `/agencias` | mapa con agrupación, filtros, más cercano y ruta dibujada |
| `/tipo-cambio`, `/perfil`, `/seguridad`, `/notificaciones` | herramientas y cuenta |

## Componentes clave
`components/MisPrestamos.tsx` (préstamos + modal de pago de N cuotas), `components/AgenciasMap.tsx` (mapa), `lib/agencias.ts` (puntos de ejemplo, horarios, distancia), `lib/amortizacion.ts` (simulador), `lib/productos.ts` (catálogo = productos del CORE), `components/GestionStepper.tsx`.

## Notas de UI
Tema claro/oscuro (`data-theme`), móvil primero (modales tipo hoja inferior, campos 16 px para evitar zoom en iOS), mapa tipo Apple Maps con hoja arrastrable.
