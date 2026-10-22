-- 06 · Notificaciones push (Web Push): dispositivos suscritos de cada cliente. Idempotente.
CREATE TABLE IF NOT EXISTS push_suscripciones (
    id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id  uuid         NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    endpoint    text         NOT NULL UNIQUE,
    p256dh      text         NOT NULL,
    auth        text         NOT NULL,
    user_agent  varchar(200),
    created_at  timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_push_cliente ON push_suscripciones (cliente_id);
