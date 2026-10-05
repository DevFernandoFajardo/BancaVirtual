-- =====================================================================
-- BancaVirtual - Paso 1: esquema de tablas
-- Ejecutar en pgAdmin conectado a la base "banca_virtual" (Query Tool).
-- Es idempotente: se puede correr varias veces sin borrar datos.
-- Requiere PostgreSQL 13+ (gen_random_uuid() viene incluido).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- clientes: usuarios de la banca virtual (y administradores)
-- DPI y NIT se guardan CIFRADOS desde la API (AES-256-GCM).
-- dpi_hash es un HMAC del DPI: sirve para garantizar unicidad sin guardarlo en claro.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
    id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    email                    varchar(160)  NOT NULL UNIQUE,
    password_hash            varchar(100)  NOT NULL,
    rol                      varchar(10)   NOT NULL DEFAULT 'CLIENTE'
                                           CHECK (rol IN ('CLIENTE', 'ADMIN')),
    primer_nombre            varchar(80)   NOT NULL,
    primer_apellido          varchar(80)   NOT NULL,
    dpi_cifrado              text,
    dpi_hash                 varchar(64)   UNIQUE,
    nit_cifrado              text,
    fecha_nacimiento         date,
    ingresos_mensuales       numeric(14,2) NOT NULL DEFAULT 0 CHECK (ingresos_mensuales >= 0),
    tipo_empleo              varchar(40),
    antiguedad_laboral_meses integer       NOT NULL DEFAULT 0 CHECK (antiguedad_laboral_meses >= 0),
    created_at               timestamptz   NOT NULL DEFAULT now(),
    updated_at               timestamptz   NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- cuentas: ahorro y monetaria (un cliente puede tener todas las que quiera)
-- El CHECK (saldo >= 0) es una red de seguridad: aunque la API fallara,
-- la base nunca permite un saldo negativo.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cuentas (
    id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    numero      varchar(12)   NOT NULL UNIQUE,
    tipo        varchar(12)   NOT NULL CHECK (tipo IN ('AHORRO', 'MONETARIA')),
    moneda      varchar(3)    NOT NULL DEFAULT 'GTQ',
    saldo       numeric(16,2) NOT NULL DEFAULT 0 CHECK (saldo >= 0),
    estado      varchar(12)   NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'BLOQUEADA', 'CERRADA')),
    alias       varchar(40),
    cliente_id  uuid          NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    created_at  timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_cuentas_cliente ON cuentas (cliente_id);

-- ---------------------------------------------------------------------
-- movimientos: estado de cuenta (cada debito/credito)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimientos (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    cuenta_id       uuid          NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
    tipo            varchar(8)    NOT NULL CHECK (tipo IN ('DEBITO', 'CREDITO')),
    monto           numeric(16,2) NOT NULL CHECK (monto > 0),
    saldo_posterior numeric(16,2) NOT NULL,
    descripcion     varchar(140)  NOT NULL,
    referencia      varchar(24),
    created_at      timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_movimientos_cuenta_fecha ON movimientos (cuenta_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_movimientos_referencia   ON movimientos (referencia);

-- ---------------------------------------------------------------------
-- transferencias: comprobante de cada transferencia simulada
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transferencias (
    id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    referencia        varchar(24)   NOT NULL UNIQUE,
    cuenta_origen_id  uuid          NOT NULL REFERENCES cuentas(id),
    cuenta_destino_id uuid          NOT NULL REFERENCES cuentas(id),
    monto             numeric(16,2) NOT NULL CHECK (monto > 0),
    moneda            varchar(3)    NOT NULL DEFAULT 'GTQ',
    descripcion       varchar(140)  NOT NULL,
    estado            varchar(12)   NOT NULL DEFAULT 'COMPLETADA',
    created_at        timestamptz   NOT NULL DEFAULT now(),
    CHECK (cuenta_origen_id <> cuenta_destino_id)
);
CREATE INDEX IF NOT EXISTS ix_transferencias_origen  ON transferencias (cuenta_origen_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_transferencias_destino ON transferencias (cuenta_destino_id, created_at DESC);

-- ---------------------------------------------------------------------
-- solicitudes: solicitudes de productos (tarjetas, etc.) evaluadas por el CORE
-- evaluacion_id = id de la evaluacion en CreditPulse (trazabilidad)
-- politicas / sib = respuesta del CORE guardada como JSON
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS solicitudes (
    id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id          uuid         NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    producto_codigo     varchar(40)  NOT NULL,
    producto_nombre     varchar(120),
    evaluacion_id       integer      NOT NULL,
    resultado_general   varchar(12)  NOT NULL,
    resultado_etiqueta  varchar(60),
    politicas           jsonb        NOT NULL,
    sib                 jsonb,
    estado              varchar(30)  NOT NULL CHECK (estado IN (
                            'EN_EVALUACION',
                            'PENDIENTE_DECISION_CLIENTE',
                            'RECHAZADA_POR_POLITICAS',
                            'RECHAZADA_POR_CLIENTE',
                            'ACEPTADA',
                            'EMITIDA',
                            'CANCELADA')),
    resultado_visible_at timestamptz NOT NULL DEFAULT now(), -- el cliente ve el resultado a partir de aqui (espera de demo)
    decision_cliente_at timestamptz,
    nota_admin          varchar(300),
    created_at          timestamptz  NOT NULL DEFAULT now(),
    updated_at          timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_solicitudes_cliente    ON solicitudes (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_solicitudes_estado     ON solicitudes (estado);
CREATE INDEX IF NOT EXISTS ix_solicitudes_evaluacion ON solicitudes (evaluacion_id);

-- Un cliente no puede tener dos solicitudes vigentes del mismo producto
-- (aunque lleguen dos peticiones al mismo tiempo, la base lo impide).
CREATE UNIQUE INDEX IF NOT EXISTS ux_solicitud_vigente
    ON solicitudes (cliente_id, producto_codigo)
    WHERE estado IN ('EN_EVALUACION', 'PENDIENTE_DECISION_CLIENTE', 'ACEPTADA', 'EMITIDA');

COMMIT;
