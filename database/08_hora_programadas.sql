-- =====================================================================
-- 08: hora de ejecución para las transferencias programadas
-- Correr en Neon ANTES de desplegar la API. Idempotente.
-- Las programadas que ya existían quedan a las 08:00 (hora de Guatemala).
-- =====================================================================
ALTER TABLE transferencias_programadas ADD COLUMN IF NOT EXISTS hora_ejecucion time NOT NULL DEFAULT '08:00';
