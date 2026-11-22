-- Additive only: existing customers, bookings and migration checksums are preserved.
CREATE TABLE public_sessoes (
  hash text PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  nome text,
  whatsapp text
);
CREATE INDEX public_sessoes_expiracao ON public_sessoes(expira_em);
CREATE TABLE public_limites (
  chave text PRIMARY KEY,
  quantidade integer NOT NULL,
  expira_em timestamptz NOT NULL
);
CREATE INDEX public_limites_expiracao ON public_limites(expira_em);
CREATE TABLE public_reservas (
  chave uuid PRIMARY KEY REFERENCES agendamentos(chave) ON DELETE CASCADE,
  sessao_hash text NOT NULL REFERENCES public_sessoes(hash) ON DELETE CASCADE,
  pedido_hash text NOT NULL,
  comprovante jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX public_reservas_sessao ON public_reservas(sessao_hash);
