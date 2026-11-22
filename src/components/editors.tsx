"use client";
import { useEffect, useState } from "react";
import { api, Badge, Empty, Modal, money } from "./shared";
import { dayLabel, localTime, today } from "@/lib/time";
import type { Appointment, Bootstrap, Client, Service } from "@/lib/types";
export function ClientEditor({
  client,
  data,
  onClose,
  onSaved,
  onDeleted,
}: {
  client?: Client;
  data: Bootstrap;
  onClose: () => void;
  onSaved: (c: Client) => void;
  onDeleted: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState<Appointment[]>([]);
  const [invitations, setInvitations] = useState(Boolean(client?.permiteConvites));
  const [weeklyActive, setWeeklyActive] = useState(Boolean(client?.conviteSemanalAtivo && client?.permiteConvites));
  useEffect(() => {
    if (client)
      api<Appointment[]>(`history?client=${client.id}`)
        .then(setHistory)
        .catch((e) => setError(e.message));
  }, [client]);
  return (
    <Modal
      title={client ? "Cliente e histórico" : "Novo cliente"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            const c = await api<Client>("clients", {
              id: client?.id,
              nome: f.get("nome"),
              whatsapp: f.get("whatsapp"),
              fixo: f.get("fixo") === "on",
              permiteConvites: invitations,
              conviteSemanalAtivo: weeklyActive && invitations,
              profissional_preferencial: f.get("pro")
                ? Number(f.get("pro"))
                : null,
              observacoes: f.get("notes"),
            });
            onSaved(c);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nome
          <input
            name="nome"
            defaultValue={client?.nome}
            required
            minLength={2}
            maxLength={100}
            autoFocus
          />
        </label>
        <label>
          WhatsApp
          <input
            name="whatsapp"
            type="tel"
            inputMode="tel"
            defaultValue={client?.whatsapp}
            onChange={() => { setInvitations(false); setWeeklyActive(false); }}
            placeholder="DDD + telefone"
            required
            maxLength={20}
          />
        </label>
        <label className="check">
          <input name="fixo" type="checkbox" defaultChecked={client?.fixo} />{" "}
          Cliente fixo
        </label>
        <label className="check">
          <input type="checkbox" checked={invitations} onChange={(e) => { setInvitations(e.target.checked); if (!e.target.checked) setWeeklyActive(false); }} />
          Cliente autorizou convites de segunda-feira pelo WhatsApp
        </label>
        <p className="hint">Marque somente com a autorização do cliente. Para parar, ele pode responder SAIR.</p>
        <label className="check">
          <input name="conviteSemanalAtivo" type="checkbox" checked={weeklyActive} disabled={!invitations || busy}
            onChange={(e) => setWeeklyActive(e.target.checked)} />
          Convite semanal ativo
        </label>
        <p className="hint">Envia o convite de agendamento toda segunda-feira a partir das 09h (São Paulo). Quem já tem reserva ativa na semana não recebe. Desmarque para retirar da lista. Esta opção não altera os dias de atendimento.</p>
        <label>
          Profissional preferencial
          <select
            name="pro"
            defaultValue={data.profissionais.find((p) => p.ativo && p.papel === "dono")?.id ?? ""}
          >
            <option value="">Atendimento com o Dono</option>
            {data.profissionais.filter((p) => p.ativo && p.papel === "dono").map((p) => (
              <option value={p.id} key={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Observações
          <textarea
            name="notes"
            defaultValue={client?.observacoes}
            maxLength={1000}
            rows={3}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Aguarde…" : "Salvar cliente"}
        </button>
      </form>
      {client && (
        <button
          type="button"
          disabled={busy}
          style={{
            marginTop: 16,
            minHeight: 44,
            width: "100%",
            color: "#fca5a5",
            border: "1px solid #b45353",
            borderRadius: 12,
            background: "transparent",
          }}
          onClick={async () => {
            if (busy) return;
            if (!window.confirm(
              `Excluir o cadastro de ${client.nome}? Esta ação não pode ser desfeita. Clientes com agendamentos não serão excluídos.`,
            )) return;
            setError("");
            setBusy(true);
            try {
              await api("remove-client", { id: client.id });
              onDeleted();
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Excluir cliente
        </button>
      )}
      {client && (
        <section className="history">
          <h3>Histórico de atendimentos</h3>
          <small>
            {history.filter((a) => a.status === "Concluído").length} concluídos
            nesta lista · até 100 registros mais recentes
          </small>
          {history.length ? (
            history.map((a) => (
              <article className="history-row" key={a.id}>
                <span>
                  <strong>{a.servico}</strong>
                  <small>
                    {dayLabel(today(new Date(a.inicio)))} ·{" "}
                    {localTime(a.inicio)}
                  </small>
                </span>
                <Badge status={a.status} />
              </article>
            ))
          ) : (
            <Empty>Nenhum atendimento registrado.</Empty>
          )}
        </section>
      )}
    </Modal>
  );
}
export function ServiceEditor({
  service,
  onClose,
  onSaved,
}: {
  service?: Service;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={service ? "Editar serviço" : "Novo serviço"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            await api("services", {
              id: service?.id,
              nome: f.get("nome"),
              precoCentavos: Math.round(Number(f.get("preco")) * 100),
              duracao: Number(f.get("duracao")),
              ativo: f.get("ativo") === "on",
            });
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nome
          <input
            name="nome"
            defaultValue={service?.nome}
            required
            maxLength={60}
          />
        </label>
        <div className="two-fields">
          <label>
            Preço (R$)
            <input
              name="preco"
              type="number"
              min="0"
              step="0.01"
              defaultValue={(service?.precoCentavos ?? 3500) / 100}
              required
            />
          </label>
          <label>
            Duração (min)
            <input
              name="duracao"
              type="number"
              min="15"
              max="240"
              step="15"
              defaultValue={service?.duracao ?? 30}
              required
            />
          </label>
        </div>
        <label className="check">
          <input
            name="ativo"
            type="checkbox"
            defaultChecked={service?.ativo ?? true}
          />{" "}
          Serviço ativo
        </label>
        <p className="hint">
          Mudanças valem para novos agendamentos. Os valores e horários já
          reservados são preservados.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          Salvar serviço
        </button>
      </form>
    </Modal>
  );
}
export function AppointmentDetail({
  appointment: a,
  data,
  onClose,
  onSaved,
  onReschedule,
}: {
  appointment: Appointment;
  data: Bootstrap;
  onClose: () => void;
  onSaved: () => void;
  onReschedule: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [cancel, setCancel] = useState(false);
  async function status(status: string) {
    setBusy(true);
    try {
      await api("status", { id: a.id, status });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const active = ["Agendado", "Confirmado"].includes(a.status);
  return (
    <Modal title={a.cliente} onClose={onClose}>
      <div className="detail">
        <Badge status={a.status} />
        <h3>
          {a.servico} · {money(a.preco_centavos)}
        </h3>
        <p>
          {dayLabel(today(new Date(a.inicio)))}
          <br />
          <strong>
            {localTime(a.inicio)} – {localTime(a.fim)}
          </strong>{" "}
          · {data.profissionais.find((p) => p.id === a.profissional_id)?.nome}
        </p>
        <h4>Observações do atendimento</h4>
        <p>{a.observacoes || "Nenhuma observação."}</p>
        <h4>Observações do cliente</h4>
        <p>{a.cliente_observacoes || "Nenhuma observação."}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {active && (
          <div className="action-stack">
            {a.status === "Agendado" && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => status("Confirmado")}
              >
                Confirmar atendimento
              </button>
            )}
            <button disabled={busy} onClick={onReschedule}>
              Remarcar atendimento
            </button>
            {new Date(a.inicio) <= new Date() && (
              <div className="two-fields">
                <button disabled={busy} onClick={() => status("Concluído")}>
                  Concluir
                </button>
                <button disabled={busy} onClick={() => status("Faltou")}>
                  Marcar falta
                </button>
              </div>
            )}
            {cancel ? (
              <div className="panel">
                <p>Cancelar este atendimento e liberar o horário?</p>
                <div className="two-fields">
                  <button onClick={() => setCancel(false)}>Voltar</button>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => status("Cancelado")}
                  >
                    Sim, cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="text-button danger"
                disabled={busy}
                onClick={() => setCancel(true)}
              >
                Cancelar agendamento
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
