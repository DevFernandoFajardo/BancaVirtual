-- =====================================================================
-- BancaVirtual - Paso 0: crear la base de datos
-- Ejecutar en pgAdmin conectado a la base "postgres" (Query Tool).
-- CREATE DATABASE no puede correr dentro de una transaccion, por eso va aparte.
-- =====================================================================

CREATE DATABASE banca_virtual
    WITH ENCODING = 'UTF8'
         TEMPLATE = template0;
