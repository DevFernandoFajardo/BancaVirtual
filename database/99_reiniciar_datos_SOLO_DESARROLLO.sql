-- =====================================================================
-- BancaVirtual - OPCIONAL: borra TODOS los datos y tablas (solo desarrollo)
-- Despues de correr esto, vuelve a ejecutar 01, 02 y 03 (en ese orden).
-- El administrador inicial se recrea solo al arrancar la API.
-- =====================================================================

DROP TABLE IF EXISTS notificaciones, tarjeta_movimientos, tarjetas, pagos_servicios, servicios_pago,
    transferencias_programadas, beneficiarios, sesiones,
    transferencias, movimientos, solicitudes, cuentas, clientes CASCADE;
