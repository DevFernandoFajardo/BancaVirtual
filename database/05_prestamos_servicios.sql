-- =====================================================================
-- 05 · Préstamos con cuotas, varias solicitudes por producto y pago de servicios por API externa
-- Idempotente y NO destructivo: se puede ejecutar varias veces en el SQL Editor de Neon.
-- =====================================================================

-- 1) Solicitudes: plazo (cuotas) que desea el cliente / define el banco
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS plazo_meses integer;

-- 2) Un cliente puede volver a pedir un producto cuando el anterior ya fue COMPLETADO (EMITIDA):
--    solo se bloquea mientras haya una gestión EN CURSO del mismo producto.
DROP INDEX IF EXISTS ux_solicitud_vigente;
CREATE UNIQUE INDEX ux_solicitud_vigente
    ON solicitudes (cliente_id, producto_codigo)
    WHERE estado IN ('EN_EVALUACION', 'PENDIENTE_DECISION_CLIENTE', 'ACEPTADA');

-- 3) Préstamos otorgados (se crean cuando el banco completa/aprueba una gestión de crédito)
CREATE TABLE IF NOT EXISTS prestamos (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id      uuid          NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    solicitud_id    uuid          UNIQUE REFERENCES solicitudes(id),
    producto_codigo varchar(40)   NOT NULL,
    producto_nombre varchar(120)  NOT NULL,
    numero          varchar(14)   NOT NULL UNIQUE,
    monto           numeric(16,2) NOT NULL CHECK (monto > 0),
    tasa_anual      numeric(6,3)  NOT NULL,
    cuotas_total    integer       NOT NULL CHECK (cuotas_total BETWEEN 1 AND 360),
    cuota_monto     numeric(16,2) NOT NULL,
    saldo_capital   numeric(16,2) NOT NULL,
    estado          varchar(12)   NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE', 'LIQUIDADO')),
    cuenta_desembolso_id uuid     REFERENCES cuentas(id),
    created_at      timestamptz   NOT NULL DEFAULT now(),
    updated_at      timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_prestamos_cliente ON prestamos (cliente_id, created_at DESC);

CREATE TABLE IF NOT EXISTS prestamo_cuotas (
    id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    prestamo_id  uuid          NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
    numero       integer       NOT NULL,
    vence        date          NOT NULL,
    capital      numeric(16,2) NOT NULL,
    interes      numeric(16,2) NOT NULL,
    total        numeric(16,2) NOT NULL,
    estado       varchar(10)   NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'PAGADA')),
    pagada_at    timestamptz,
    referencia   varchar(24),
    UNIQUE (prestamo_id, numero)
);
CREATE INDEX IF NOT EXISTS ix_cuotas_prestamo ON prestamo_cuotas (prestamo_id, numero);

-- 4) Pago de servicios mediante API externa: estado y datos de autorización del proveedor
ALTER TABLE pagos_servicios ADD COLUMN IF NOT EXISTS estado varchar(12) NOT NULL DEFAULT 'APROBADO';
ALTER TABLE pagos_servicios ADD COLUMN IF NOT EXISTS autorizacion varchar(80);
ALTER TABLE pagos_servicios ADD COLUMN IF NOT EXISTS proveedor varchar(40);
