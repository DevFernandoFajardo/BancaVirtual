-- 07 · Abonos externos (p. ej. pago de planillas desde CP Gestiones). Idempotente.
-- Cada abono se identifica por la `referencia` que envía el sistema externo: reenviarla NO acredita dos veces.
CREATE TABLE IF NOT EXISTS abonos_externos (
    referencia   varchar(64)   PRIMARY KEY,
    origen       varchar(40)   NOT NULL,
    cuenta_id    uuid          NOT NULL REFERENCES cuentas(id),
    monto        numeric(16,2) NOT NULL CHECK (monto > 0),
    concepto     varchar(140)  NOT NULL,
    created_at   timestamptz   NOT NULL DEFAULT now()
);
