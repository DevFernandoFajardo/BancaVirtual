-- =====================================================================
-- 10: celular del cliente para recibir transferencias (beneficiarios por número de teléfono)
-- Correr en Neon ANTES de desplegar la API. Idempotente.
-- =====================================================================
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefono varchar(8);
CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_telefono ON clientes (telefono) WHERE telefono IS NOT NULL;
-- Cuenta que recibe cuando alguien le transfiere por celular
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cuenta_celular_id uuid REFERENCES cuentas(id) ON DELETE SET NULL;
-- Beneficiario guardado por celular (la cuenta se resuelve al listar)
ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS telefono varchar(8);
