-- =====================================================================
-- 04: Enlace de las solicitudes de productos con CP Gestiones
--     Cuando el cliente acepta un producto, la gestion se registra tambien en CP Gestiones.
--     Aqui se guarda el id que devuelve (o el motivo si fallo). No borra ni cambia datos existentes.
-- Ejecutar en db_banca_virtual DESPUES de 01, 02 y 03. Es idempotente.
-- =====================================================================
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS cp_gestion_id varchar(80);
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS cp_error      varchar(300);
-- Monto (o limite) que el cliente pide en la solicitud; se envia a CP Gestiones
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS monto_solicitado numeric(14,2);
-- Ultimo estado que reporto CP Gestiones para la gestion (para seguimiento)
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS cp_estado varchar(30);
