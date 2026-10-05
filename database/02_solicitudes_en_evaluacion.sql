-- =====================================================================
-- 02: solicitudes con espera de evaluacion (formulario + resultado diferido)
-- Ejecutar en la base db_banca_virtual (la que ya tiene 01_esquema.sql).
-- Es idempotente: se puede correr mas de una vez sin perder datos.
-- =====================================================================
BEGIN;

ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS resultado_visible_at timestamptz;
UPDATE solicitudes SET resultado_visible_at = created_at WHERE resultado_visible_at IS NULL;
ALTER TABLE solicitudes ALTER COLUMN resultado_visible_at SET DEFAULT now();
ALTER TABLE solicitudes ALTER COLUMN resultado_visible_at SET NOT NULL;

ALTER TABLE solicitudes DROP CONSTRAINT IF EXISTS solicitudes_estado_check;
ALTER TABLE solicitudes ADD CONSTRAINT solicitudes_estado_check CHECK (estado IN (
    'EN_EVALUACION',
    'PENDIENTE_DECISION_CLIENTE',
    'RECHAZADA_POR_POLITICAS',
    'RECHAZADA_POR_CLIENTE',
    'ACEPTADA',
    'EMITIDA',
    'CANCELADA'));

DROP INDEX IF EXISTS ux_solicitud_vigente;
CREATE UNIQUE INDEX ux_solicitud_vigente
    ON solicitudes (cliente_id, producto_codigo)
    WHERE estado IN ('EN_EVALUACION', 'PENDIENTE_DECISION_CLIENTE', 'ACEPTADA', 'EMITIDA');

COMMIT;
