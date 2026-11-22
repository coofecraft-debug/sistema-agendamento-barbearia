-- Fase 3 local: tabelas aditivas, sem enviar WhatsApp. Não modificar migrations anteriores.
ALTER TABLE public_sessoes ADD COLUMN permite_notificacoes boolean NOT NULL DEFAULT false;
CREATE TABLE comunicacao_consentimentos (
  agendamento_id uuid PRIMARY KEY REFERENCES agendamentos(id) ON DELETE CASCADE,
  autorizado boolean NOT NULL DEFAULT false,
  origem text NOT NULL CHECK (origem IN ('publico','administrativo')),
  registrado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE comunicacao_versoes (
  agendamento_id uuid PRIMARY KEY REFERENCES agendamentos(id) ON DELETE CASCADE,
  revisao integer NOT NULL CHECK (revisao > 0)
);
CREATE TABLE comunicacao_tokens (
  hash text PRIMARY KEY,
  agendamento_id uuid NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  revisao integer NOT NULL,
  acao text NOT NULL CHECK (acao IN ('confirmar','cancelar')),
  expira_em timestamptz NOT NULL,
  usado_em timestamptz
);
CREATE INDEX comunicacao_tokens_agendamento ON comunicacao_tokens(agendamento_id,revisao);
CREATE TABLE comunicacao_fila (
  id bigserial PRIMARY KEY,
  agendamento_id uuid NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  revisao integer NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('confirmacao','lembrete')),
  executar_em timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','simulado','cancelado','falhou')),
  tentativas integer NOT NULL DEFAULT 0,
  conteudo text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  simulado_em timestamptz,
  ultima_falha text,
  UNIQUE (agendamento_id,revisao,tipo)
);
CREATE INDEX comunicacao_fila_pendentes ON comunicacao_fila(executar_em,id) WHERE status='pendente';
