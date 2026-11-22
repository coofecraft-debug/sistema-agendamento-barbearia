-- BLACK | Post-confirmation WhatsApp acknowledgment. Additive only.
-- Do not modify historical migrations or the existing confirmation/reminder queue.
CREATE TABLE comunicacao_respostas (
  id bigserial PRIMARY KEY,
  agendamento_id uuid NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  revisao integer NOT NULL CHECK (revisao > 0),
  whatsapp text NOT NULL CHECK (whatsapp ~ '^55[1-9]{2}9[0-9]{8}$'),
  executar_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','enviando','enviado','falhou','incerto','cancelado')),
  tentativas integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  ultima_falha text,
  meta_message_id text UNIQUE,
  meta_requisitado_em timestamptz,
  meta_respondido_em timestamptz,
  meta_entrega_status text
    CHECK (meta_entrega_status IS NULL OR meta_entrega_status IN ('sent','delivered','read','failed')),
  meta_entrega_em timestamptz,
  UNIQUE (agendamento_id, revisao),
  CHECK (expira_em > executar_em)
);
CREATE INDEX comunicacao_respostas_pendentes
  ON comunicacao_respostas(executar_em, id) WHERE status='pendente';
