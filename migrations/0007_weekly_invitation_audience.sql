-- Explicit admin selection, independent from public consent or the recurring-client label.
CREATE TABLE comunicacao_convites_destinatarios (
  cliente_id integer PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,
  whatsapp text NOT NULL CHECK (whatsapp ~ '^55[1-9]{2}9[0-9]{8}$'),
  ativo boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comunicacao_convites_destinatarios_ativos
  ON comunicacao_convites_destinatarios(whatsapp) WHERE ativo;
