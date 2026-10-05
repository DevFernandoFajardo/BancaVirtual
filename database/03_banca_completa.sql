-- =====================================================================
-- 03: banca completa (estado de cuenta, beneficiarios, transferencias programadas,
--     pago de servicios, tarjetas, seguridad, notificaciones, plazo fijo)
-- Ejecutar en la base db_banca_virtual (la que ya tiene 01 y 02).
-- Es idempotente: se puede correr mas de una vez sin perder datos.
-- Si existe un 03_monto_solicitado.sql viejo, ignoralo/borralo: ya no se usa.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- Cuentas: se agrega el plazo fijo
-- ---------------------------------------------------------------------
ALTER TABLE cuentas DROP CONSTRAINT IF EXISTS cuentas_tipo_check;
ALTER TABLE cuentas ADD CONSTRAINT cuentas_tipo_check CHECK (tipo IN ('AHORRO', 'MONETARIA', 'PLAZO_FIJO'));
ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS plazo_meses       integer;
ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS tasa_anual        numeric(5,2);
ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS capital_inicial   numeric(16,2);
ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS fecha_vencimiento date;

-- ---------------------------------------------------------------------
-- Seguridad: bloqueo por intentos fallidos y segundo factor (TOTP)
-- ---------------------------------------------------------------------
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS intentos_fallidos     integer     NOT NULL DEFAULT 0;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS bloqueado_hasta       timestamptz;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS totp_secreto_cifrado  text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS totp_activo           boolean     NOT NULL DEFAULT false;

-- Sesiones activas (cada token JWT lleva el id de su sesion y se puede revocar)
CREATE TABLE IF NOT EXISTS sesiones (
    id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id   uuid         NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    user_agent   varchar(300),
    ip           varchar(64),
    created_at   timestamptz  NOT NULL DEFAULT now(),
    last_seen_at timestamptz  NOT NULL DEFAULT now(),
    expires_at   timestamptz  NOT NULL,
    revocada     boolean      NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS ix_sesiones_cliente ON sesiones (cliente_id, created_at DESC);

-- ---------------------------------------------------------------------
-- Beneficiarios (cuentas de terceros guardadas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beneficiarios (
    id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id    uuid         NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    alias         varchar(60)  NOT NULL,
    cuenta_numero varchar(12)  NOT NULL,
    titular       varchar(120) NOT NULL,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (cliente_id, cuenta_numero)
);

-- ---------------------------------------------------------------------
-- Transferencias programadas / recurrentes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transferencias_programadas (
    id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id            uuid          NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    cuenta_origen_id      uuid          NOT NULL REFERENCES cuentas(id),
    cuenta_destino_numero varchar(12)   NOT NULL,
    monto                 numeric(16,2) NOT NULL CHECK (monto > 0),
    descripcion           varchar(140)  NOT NULL DEFAULT 'Transferencia programada',
    frecuencia            varchar(10)   NOT NULL CHECK (frecuencia IN ('UNICA', 'SEMANAL', 'QUINCENAL', 'MENSUAL')),
    proxima_ejecucion     date          NOT NULL,
    estado                varchar(12)   NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'PAUSADA', 'COMPLETADA', 'CANCELADA')),
    ultima_ejecucion      timestamptz,
    ultimo_error          varchar(200),
    created_at            timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_programadas_cliente ON transferencias_programadas (cliente_id);
CREATE INDEX IF NOT EXISTS ix_programadas_due     ON transferencias_programadas (proxima_ejecucion) WHERE estado = 'ACTIVA';

-- ---------------------------------------------------------------------
-- Pago de servicios
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS servicios_pago (
    codigo      varchar(30)  PRIMARY KEY,
    nombre      varchar(80)  NOT NULL,
    categoria   varchar(30)  NOT NULL,
    referencia_etiqueta varchar(40) NOT NULL DEFAULT 'Número de contrato'
);
INSERT INTO servicios_pago (codigo, nombre, categoria, referencia_etiqueta) VALUES
    ('LUZ_EEGSA',     'Energía eléctrica (EEGSA)',      'Energía',   'Número de contador (NIS)'),
    ('LUZ_ENERGUATE', 'Energía eléctrica (Energuate)',  'Energía',   'Número de contador (NIS)'),
    ('AGUA_EMPAGUA',  'Agua potable (EMPAGUA)',         'Agua',      'Número de servicio'),
    ('TEL_TIGO',      'Telefonía móvil (Tigo)',         'Telefonía', 'Número de teléfono'),
    ('TEL_CLARO',     'Telefonía móvil (Claro)',        'Telefonía', 'Número de teléfono'),
    ('NET_CABLE',     'Internet y cable',               'Internet',  'Número de contrato'),
    ('MUNI',          'Impuestos municipales',          'Gobierno',  'Número de boleta')
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS pagos_servicios (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id      uuid          NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    cuenta_id       uuid          NOT NULL REFERENCES cuentas(id),
    servicio_codigo varchar(30)   NOT NULL REFERENCES servicios_pago(codigo),
    servicio_nombre varchar(80)   NOT NULL,
    contrato        varchar(40)   NOT NULL,
    monto           numeric(16,2) NOT NULL CHECK (monto > 0),
    referencia      varchar(24)   NOT NULL UNIQUE,
    created_at      timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_pagos_cliente ON pagos_servicios (cliente_id, created_at DESC);

-- ---------------------------------------------------------------------
-- Tarjetas de credito (se crean cuando una solicitud de TARJETA_CREDITO pasa a EMITIDA)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tarjetas (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id      uuid          NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    solicitud_id    uuid          UNIQUE REFERENCES solicitudes(id),
    producto_nombre varchar(120)  NOT NULL,
    ultimos4        varchar(4)    NOT NULL,
    titular         varchar(120)  NOT NULL,
    vencimiento     varchar(5)    NOT NULL,
    limite          numeric(14,2) NOT NULL CHECK (limite > 0),
    saldo_utilizado numeric(14,2) NOT NULL DEFAULT 0 CHECK (saldo_utilizado >= 0),
    estado          varchar(12)   NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'BLOQUEADA')),
    created_at      timestamptz   NOT NULL DEFAULT now(),
    CHECK (saldo_utilizado <= limite)
);
CREATE INDEX IF NOT EXISTS ix_tarjetas_cliente ON tarjetas (cliente_id);

CREATE TABLE IF NOT EXISTS tarjeta_movimientos (
    id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    tarjeta_id  uuid          NOT NULL REFERENCES tarjetas(id) ON DELETE CASCADE,
    tipo        varchar(8)    NOT NULL CHECK (tipo IN ('CONSUMO', 'PAGO')),
    monto       numeric(14,2) NOT NULL CHECK (monto > 0),
    descripcion varchar(140)  NOT NULL,
    created_at  timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_tarjeta_mov ON tarjeta_movimientos (tarjeta_id, created_at DESC);

-- Tarjetas para solicitudes que ya estaban emitidas antes de este script
INSERT INTO tarjetas (cliente_id, solicitud_id, producto_nombre, ultimos4, titular, vencimiento, limite)
SELECT s.cliente_id, s.id, COALESCE(s.producto_nombre, 'Tarjeta de Crédito'),
       lpad((floor(random() * 10000))::int::text, 4, '0'),
       upper(c.primer_nombre || ' ' || c.primer_apellido),
       to_char(now() + interval '4 years', 'MM/YY'),
       greatest(2000, round(c.ingresos_mensuales * 3 / 100) * 100)
  FROM solicitudes s JOIN clientes c ON c.id = s.cliente_id
 WHERE s.estado = 'EMITIDA' AND s.producto_codigo = 'TARJETA_CREDITO'
   AND NOT EXISTS (SELECT 1 FROM tarjetas t WHERE t.solicitud_id = s.id);

-- ---------------------------------------------------------------------
-- Notificaciones (campanita)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notificaciones (
    id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id uuid         NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    tipo       varchar(20)  NOT NULL,
    titulo     varchar(120) NOT NULL,
    mensaje    varchar(400) NOT NULL,
    enlace     varchar(120),
    leida      boolean      NOT NULL DEFAULT false,
    created_at timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_notif_cliente ON notificaciones (cliente_id, created_at DESC);

COMMIT;
