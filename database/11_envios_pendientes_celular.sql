-- =====================================================================
-- 11: envíos por celular a números aún no registrados (el dinero queda retenido hasta que
--     alguien registre ese celular; si no ocurre en 7 días se devuelve a quien lo envió).
-- Correr en Neon ANTES de desplegar la API. Idempotente. Requiere haber corrido 10_celular.sql.
-- =====================================================================
CREATE TABLE IF NOT EXISTS transferencias_celular (
    id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    referencia       varchar(24)   NOT NULL UNIQUE,
    cliente_id       uuid          NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    cuenta_origen_id uuid          NOT NULL REFERENCES cuentas(id)  ON DELETE CASCADE,
    telefono         varchar(8)    NOT NULL,
    monto            numeric(16,2) NOT NULL CHECK (monto > 0),
    moneda           varchar(3)    NOT NULL DEFAULT 'GTQ',
    descripcion      varchar(140)  NOT NULL,
    estado           varchar(10)   NOT NULL DEFAULT 'PENDIENTE'
                     CHECK (estado IN ('PENDIENTE', 'RECLAMADA', 'DEVUELTA', 'CANCELADA')),
    expira_en        timestamptz   NOT NULL,
    resuelta_en      timestamptz,
    created_at       timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_trf_celular_pendientes ON transferencias_celular (telefono) WHERE estado = 'PENDIENTE';
CREATE INDEX IF NOT EXISTS ix_trf_celular_cliente    ON transferencias_celular (cliente_id, created_at DESC);
