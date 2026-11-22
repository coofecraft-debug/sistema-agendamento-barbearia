"use client";
import { useEffect, useRef, useState } from "react";
import {
  CalendarCheck,
  Check,
  Clock,
  Scissors,
  Search,
  UserRound,
} from "lucide-react";
import { api, Empty, Modal, money } from "./shared";
import { localTime, today } from "@/lib/time";
import type {
  Appointment,
  Bootstrap,
  Client,
  DayAvailability,
} from "@/lib/types";
export type BookingPreset = {
  data?: string;
  horario?: string;
  profissionalId?: number;
  servicoId?: number;
  appointment?: Appointment;
};
export default function Booking({
  data,
  preset,
  onClose,
  onSaved,
  onNewClient,
  newClient,
}: {
  data: Bootstrap;
  preset: BookingPreset;
  onClose: () => void;
  onSaved: () => void;
  onNewClient: () => void;
  newClient: Client | null;
}) {
  const old = preset.appointment;
  const [client, setClient] = useState(old?.cliente_id ?? 0),
    [search, setSearch] = useState(old?.cliente ?? ""),
    [clients, setClients] = useState(data.clientes);
  const [service, setService] = useState(
    old?.servico_id ??
      preset.servicoId ??
      data.servicos.find((s) => s.ativo)?.id ??
      0,
  );
  const [pro, setPro] = useState(
    data.profissionais.find((p) => p.ativo && p.papel === "dono")?.id ?? 0,
  );
  const [day, setDay] = useState(
      old ? today(new Date(old.inicio)) : (preset.data ?? data.hoje),
    ),
    [time, setTime] = useState(
      old ? localTime(old.inicio) : (preset.horario ?? ""),
    );
  const [note, setNote] = useState(old?.observacoes ?? ""),
    [slots, setSlots] = useState<string[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [key] = useState(() => crypto.randomUUID());
  const [notifications, setNotifications] = useState(Boolean(old?.permite_notificacoes));
  const appliedClient = useRef<number | null>(null);
  useEffect(() => {
    if (!newClient || appliedClient.current === newClient.id) return;
    appliedClient.current = newClient.id;
    setClient(newClient.id);
    setNotifications(false);
    setSearch(newClient.nome);
    if (!preset.profissionalId && !old)
      setPro(
        data.profissionais.find((p) => p.ativo && p.papel === "dono")?.id ?? 0,
      );
  }, [newClient, preset.profissionalId, old, data.profissionais]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      api<Client[]>(`clients?q=${encodeURIComponent(search)}`)
        .then((c) => {
          if (live) setClients(c);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api<DayAvailability[]>(
      `availability?from=${day}&days=1${old ? "" : "&grid=public"}&service=${service}&professional=${pro}${old ? "&exclude=" + old.id : ""}`,
    )
      .then((a) => {
        if (live) {
          const valid = a[0]?.profissionais[0]?.horarios ?? [];
          setSlots(valid);
          setTime((t) => (valid.includes(t) ? t : ""));
        }
      })
      .catch((e) => {
        if (live) {
          setSlots([]);
          setError(e.message);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [day, service, pro, old]);
  function choose(c: Client) {
    setClient(c.id);
    setNotifications(false);
    setSearch(c.nome);
    if (!preset.profissionalId && !old)
      setPro(
        data.profissionais.find((p) => p.ativo && p.papel === "dono")?.id ?? 0,
      );
  }
  return (
    <Modal
      title={old ? "Remarcar atendimento" : "Agendamento rápido"}
      onClose={onClose}
    >
      <form
        className="booking"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("booking", {
              id: old?.id,
              clienteId: client,
              permiteNotificacoes: notifications,
              servicoId: service,
              profissionalId: pro,
              data: day,
              horario: time,
              observacoes: note,
              chave: key,
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
          <span>
            <UserRound size={18} /> Cliente
          </span>
          <div className="search">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setClient(0);
                setNotifications(false);
              }}
              placeholder="Nome ou WhatsApp"
              autoFocus
            />
          </div>
        </label>
        {!client && (
          <div className="client-options">
            {clients.slice(0, 6).map((c) => (
              <button type="button" key={c.id} onClick={() => choose(c)}>
                <span>
                  {c.nome}
                  <small>{c.whatsapp}</small>
                </span>
                <span className="badge">{c.fixo ? "Fixo" : "Novo"}</span>
              </button>
            ))}
            <button type="button" className="text-button" onClick={onNewClient}>
              + Cadastrar cliente
            </button>
          </div>
        )}
        <fieldset>
          <legend>
            <Scissors size={18} /> Serviço
          </legend>
          <div className="service-picker">
            {data.servicos
              .filter((s) => s.ativo)
              .map((s) => (
                <button
                  type="button"
                  aria-pressed={service === s.id}
                  className={service === s.id ? "selected" : ""}
                  key={s.id}
                  onClick={() => setService(s.id)}
                >
                  <Scissors size={26} />
                  <strong>{s.nome}</strong>
                  <b>{money(s.precoCentavos)}</b>
                  <small>
                    <Clock size={13} />
                    {s.duracao} min
                  </small>
                  {service === s.id && (
                    <Check className="choice-check" size={16} />
                  )}
                </button>
              ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>
            <UserRound size={18} /> Profissional
          </legend>
          <div className="segmented">
            {data.profissionais
              .filter((p) => p.ativo && p.papel === "dono")
              .map((p) => (
                <button
                  type="button"
                  aria-pressed={pro === p.id}
                  className={pro === p.id ? "active" : ""}
                  key={p.id}
                  onClick={() => setPro(p.id)}
                >
                  {p.nome}
                </button>
              ))}
          </div>
          <small>Sugerido conforme o cliente. Você pode alterar.</small>
        </fieldset>
        <label>
          Data
          <input
            type="date"
            required
            value={day}
            min={data.hoje}
            onChange={(e) => {
              if (e.target.value) setDay(e.target.value);
            }}
          />
        </label>
        <fieldset>
          <legend>
            <Clock size={18} /> Horários disponíveis
          </legend>
          {loading ? (
            <p>Consultando a agenda…</p>
          ) : slots.length ? (
            <div className="slots">
              {slots.map((t) => (
                <button
                  type="button"
                  className={time === t ? "selected" : ""}
                  key={t}
                  onClick={() => setTime(t)}
                  aria-pressed={time === t}
                >
                  {t}
                </button>
              ))}
            </div>
          ) : (
            <Empty>
              Sem horários disponíveis. Escolha outro dia ou profissional.
            </Empty>
          )}
        </fieldset>
        <label>
          Observação <small>(opcional)</small>
          <textarea
            maxLength={200}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Algum detalhe para este atendimento?"
          />
          <small>{note.length}/200</small>
        </label>
        <label className="check">
          <input type="checkbox" checked={notifications} onChange={(e) => setNotifications(e.target.checked)} />
          Cliente autorizou confirmação e lembrete pelo WhatsApp
        </label>
        <p className="hint">O agendamento pode ser salvo sem esta opção. O cliente pode parar as mensagens respondendo SAIR.</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary"
          disabled={busy || loading || !client || !time}
        >
          <CalendarCheck size={21} />
          {busy
            ? "Salvando…"
            : old
              ? "Salvar remarcação"
              : "Confirmar agendamento"}
        </button>
      </form>
    </Modal>
  );
}
