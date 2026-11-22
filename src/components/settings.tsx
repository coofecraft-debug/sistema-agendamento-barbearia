"use client";
import { useState } from "react";
import {
  CalendarOff,
  Clock,
  Crown,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { api, Modal } from "./shared";
import MockMessages from "./mock-messages";
import { dayLabel, localTime, today } from "@/lib/time";
import type { Bootstrap } from "@/lib/types";
export default function Settings({
  data,
  onSaved,
}: {
  data: Bootstrap;
  onSaved: () => void;
}) {
  const [pro, setPro] = useState(data.profissionais.find((p) => p.ativo && p.papel === "dono")?.id),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<"blocks" | "extras" | number | null>(null);
  async function save(resource: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(resource, body);
      setModal(null);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings">
      <section>
        <h2>Profissionais</h2>
        <div className="professional-cards">
          {data.profissionais.filter((p) => p.ativo && p.papel === "dono").map((p) => (
            <article key={p.id} className={`panel professional ${p.papel}`}>
              <div className="avatar">
                {p.papel === "dono" ? <Crown /> : <UserRound />}
              </div>
              <div>
                <h3>{p.nome}</h3>
                <p>
                  Atende todos os clientes
                </p>
                <span className="badge green">
                  {p.ativo ? "Ativo" : "Inativo"}
                </span>
              </div>
            </article>
          ))}
        </div>
        <p className="hint">
          A classificação é manual. A sugestão de profissional pode ser alterada
          em cada agendamento.
        </p>
      </section>
      <section>
        <h2>Funcionamento</h2>
        <div className="segmented">
          {data.profissionais.filter((p) => p.ativo && p.papel === "dono").map((p) => (
            <button
              key={p.id}
              className={pro === p.id ? "active" : ""}
              onClick={() => setPro(p.id)}
            >
              {p.nome}
            </button>
          ))}
        </div>
        <div className="settings-rows">
          <div className="settings-row">
            <strong>Segunda e domingo</strong>
            <small>Fechado</small>
          </div>
          {["Terça", "Quarta", "Quinta", "Sexta", "Sábado"].map((name, i) => (
            <button
              className="settings-row"
              key={name}
              onClick={() => {
                setError("");
                setModal(i + 2);
              }}
            >
              <strong>{name}</strong>
              <span>
                {data.expediente
                  .filter(
                    (h) => h.profissional_id === pro && h.dia_semana === i + 2,
                  )
                  .map((h) => `${h.inicio.slice(0, 5)}–${h.fim.slice(0, 5)}`)
                  .join(" · ") || "Fechado"}
              </span>
              <small>Editar</small>
            </button>
          ))}
        </div>
        <p className="hint">
          O site aceita reservas 24 horas por dia, todos os dias. Os atendimentos
          acontecem de terça a sábado, conforme os horários configurados.
          Alterações no expediente não cancelam reservas existentes.
        </p>
      </section>
      <section>
        <h2>Datas disponíveis para agendamento</h2>
        <div className="panel" style={{ padding: 16 }}>
          <p>
            O sistema recebe agendamentos online de segunda a domingo, 24 horas por dia.
            As datas futuras de terça a sábado ficam disponíveis automaticamente
            até dezembro do próximo ano, respeitando expediente, bloqueios e vagas.
          </p>
          <p className="hint">Não há mais liberação semanal nem liberação especial de dezembro.</p>
        </div>
      </section>
      <section>
        <h2>Exceções na agenda</h2>
        <div className="two-fields">
          <button
            onClick={() => {
              setError("");
              setModal("extras");
            }}
          >
            <Plus size={18} /> Horário extra
          </button>
          <button
            onClick={() => {
              setError("");
              setModal("blocks");
            }}
          >
            <CalendarOff size={18} /> Bloquear horário
          </button>
        </div>
        <p className="hint">
          Horários extras respeitam dias de atendimento, bloqueios e vagas disponíveis.
        </p>
        {data.extras.map((e) => (
          <div className="settings-row panel" key={"e" + e.id}>
            <Clock size={20} />
            <span>
              <strong>
                Extra ·{" "}
                {
                  data.profissionais.find((p) => p.id === e.profissional_id)
                    ?.nome
                }
              </strong>
              <small>
                {dayLabel(e.data)} · {e.inicio.slice(0, 5)}–{e.fim.slice(0, 5)}
              </small>
            </span>
            <button
              aria-label="Remover horário extra"
              disabled={busy}
              onClick={() =>
                save("remove-period", { kind: "extras", id: e.id })
              }
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
        {data.bloqueios.map((b) => (
          <div className="settings-row panel" key={"b" + b.id}>
            <CalendarOff size={20} />
            <span>
              <strong>
                {b.motivo || "Bloqueio"} ·{" "}
                {
                  data.profissionais.find((p) => p.id === b.profissional_id)
                    ?.nome
                }
              </strong>
              <small>
                {dayLabel(today(new Date(b.inicio)))} · {localTime(b.inicio)}–
                {localTime(b.fim)}
              </small>
            </span>
            <button
              aria-label="Remover bloqueio"
              disabled={busy}
              onClick={() =>
                save("remove-period", { kind: "blocks", id: b.id })
              }
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
      </section>
      {error && modal === null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {modal !== null && (
        <Modal
          title={
            typeof modal === "number"
              ? "Editar expediente"
              : modal === "blocks"
                ? "Bloquear horário"
                : "Adicionar horário extra"
          }
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (typeof modal === "number") {
                if (
                  [0, 1].some(
                    (i) =>
                      Boolean(f.get("inicio" + i)) !==
                      Boolean(f.get("fim" + i)),
                  )
                ) {
                  setError(
                    "Preencha início e fim de cada período, ou deixe os dois vazios.",
                  );
                  return;
                }
                const periodos = [0, 1]
                  .filter((i) => f.get("inicio" + i) && f.get("fim" + i))
                  .map((i) => ({
                    inicio: f.get("inicio" + i),
                    fim: f.get("fim" + i),
                  }));
                void save("hours", {
                  profissionalId: pro,
                  diaSemana: modal,
                  periodos,
                });
              } else
                void save(modal, {
                  profissionalId: Number(f.get("pro")),
                  data: f.get("data"),
                  inicio: f.get("inicio"),
                  fim: f.get("fim"),
                  motivo: f.get("motivo") ?? "",
                  diaInteiro: f.get("inteiro") === "on",
                });
            }}
          >
            {typeof modal === "number" ? (
              <>
                <p>Deixe os dois períodos vazios para fechar o dia.</p>
                {[0, 1].map((i) => {
                  const h = data.expediente.filter(
                    (h) => h.profissional_id === pro && h.dia_semana === modal,
                  )[i];
                  return (
                    <div className="two-fields" key={i}>
                      <label>
                        Início {i + 1}
                        <input
                          type="time"
                          step="900"
                          name={"inicio" + i}
                          defaultValue={h?.inicio.slice(0, 5)}
                        />
                      </label>
                      <label>
                        Fim {i + 1}
                        <input
                          type="time"
                          step="900"
                          name={"fim" + i}
                          defaultValue={h?.fim.slice(0, 5)}
                        />
                      </label>
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                <label>
                  Profissional
                  <select name="pro" defaultValue={pro}>
                    {data.profissionais.filter((p) => p.ativo && p.papel === "dono").map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Data
                  <input
                    type="date"
                    name="data"
                    min={data.hoje}
                    defaultValue={data.hoje}
                    required
                  />
                </label>
                <div className="two-fields">
                  <label>
                    Início
                    <input
                      name="inicio"
                      type="time"
                      step="900"
                      defaultValue="09:00"
                      required
                    />
                  </label>
                  <label>
                    Fim
                    <input
                      name="fim"
                      type="time"
                      step="900"
                      defaultValue="12:00"
                      required
                    />
                  </label>
                </div>
                {modal === "blocks" && (
                  <>
                    <label className="check">
                      <input type="checkbox" name="inteiro" /> Bloquear o dia
                      inteiro
                    </label>
                    <label>
                      Motivo (opcional)
                      <input
                        name="motivo"
                        maxLength={200}
                        placeholder="Ex.: folga"
                      />
                    </label>
                  </>
                )}
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar"}
            </button>
          </form>
        </Modal>
      )}
      <MockMessages />
    </div>
  );
}
