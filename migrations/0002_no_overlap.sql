-- Adição incremental: protege também contra INSERTs concorrentes fora da aplicação.
ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_sem_sobreposicao
EXCLUDE USING gist (profissional_id WITH =, tstzrange(inicio,fim,'[)') WITH &&)
WHERE (status <> 'Cancelado');
