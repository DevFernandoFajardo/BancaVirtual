-- =====================================================================
-- 03: monto solicitado en las solicitudes (cuanto desea el cliente)
-- Ejecutar en la base db_banca_virtual. Es idempotente.
-- =====================================================================
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS monto_solicitado numeric(14,2);
ALTER TABLE solicitudes DROP CONSTRAINT IF EXISTS solicitudes_monto_solicitado_check;
ALTER TABLE solicitudes ADD CONSTRAINT solicitudes_monto_solicitado_check CHECK (monto_solicitado IS NULL OR monto_solicitado > 0);
