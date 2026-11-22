-- Additive upgrade: existing bookings, tokens and historical migrations are preserved.
ALTER TABLE public_sessoes ADD COLUMN IF NOT EXISTS permite_convites boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION black_whatsapp(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT CASE
    WHEN digits ~ '^[1-9]{2}9[0-9]{8}$' THEN '55' || digits
    WHEN digits ~ '^55[1-9]{2}9[0-9]{8}$' THEN digits
    ELSE NULL END
  FROM (SELECT regexp_replace(value, '[^0-9]', '', 'g') AS digits) n
$$;

CREATE TABLE comunicacao_preferencias (
  cliente_id integer PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,
  whatsapp text NOT NULL CHECK (whatsapp ~ '^55[1-9]{2}9[0-9]{8}$'),
  convites boolean NOT NULL DEFAULT false,
  bloqueado boolean NOT NULL DEFAULT false,
  versao integer NOT NULL DEFAULT 1 CHECK (versao > 0),
  origem text NOT NULL CHECK (origem IN ('publico', 'admin', 'whatsapp')),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comunicacao_preferencias_whatsapp ON comunicacao_preferencias(whatsapp);

CREATE TABLE comunicacao_convites (
  id bigserial PRIMARY KEY,
  cliente_id integer NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  whatsapp text NOT NULL CHECK (whatsapp ~ '^55[1-9]{2}9[0-9]{8}$'),
  semana date NOT NULL CHECK (extract(isodow FROM semana) = 1),
  versao integer NOT NULL,
  executar_em timestamptz NOT NULL,
  expira_em timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'enviando', 'enviado', 'falhou', 'incerto', 'cancelado')),
  tentativas integer NOT NULL DEFAULT 0,
  ultima_falha text,
  meta_message_id text UNIQUE,
  meta_requisitado_em timestamptz,
  meta_respondido_em timestamptz,
  meta_entrega_status text,
  meta_entrega_em timestamptz,
  UNIQUE (whatsapp, semana),
  CHECK (expira_em > executar_em)
);
CREATE INDEX comunicacao_convites_pendentes ON comunicacao_convites(executar_em, id) WHERE status = 'pendente';
