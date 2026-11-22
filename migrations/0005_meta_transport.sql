-- Prepared Meta Cloud API transport. Does not activate sending or modify existing messages.
ALTER TABLE comunicacao_fila DROP CONSTRAINT comunicacao_fila_status_check;
ALTER TABLE comunicacao_fila ADD CONSTRAINT comunicacao_fila_status_check
  CHECK (status IN ('pendente','simulado','cancelado','falhou','enviando','enviado','incerto'));
ALTER TABLE comunicacao_fila ADD COLUMN meta_message_id text UNIQUE;
ALTER TABLE comunicacao_fila ADD COLUMN meta_requisitado_em timestamptz;
ALTER TABLE comunicacao_fila ADD COLUMN meta_respondido_em timestamptz;
ALTER TABLE comunicacao_fila ADD COLUMN meta_entrega_status text
  CHECK (meta_entrega_status IS NULL OR meta_entrega_status IN ('sent','delivered','read','failed'));
ALTER TABLE comunicacao_fila ADD COLUMN meta_entrega_em timestamptz;
ALTER TABLE comunicacao_tokens DROP CONSTRAINT comunicacao_tokens_acao_check;
ALTER TABLE comunicacao_tokens ADD CONSTRAINT comunicacao_tokens_acao_check
  CHECK (acao IN ('confirmar','cancelar','gerenciar'));
-- In-flight and uncertain records are intentionally not requeued automatically.
CREATE INDEX comunicacao_fila_meta_pendentes ON comunicacao_fila(executar_em,id)
  WHERE status='pendente';
