"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Crown,
  BadgeCheck,
  Shirt,
  CalendarCheck2,
  Download,
  Scissors,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { addDays, dayLabel, weekday } from "@/lib/time";
import type {
  PublicAvailability,
  PublicBootstrap,
  PublicReceipt,
} from "@/lib/public-validation";
const currency = (n: number) =>
  (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
async function call<T>(resource: string, data: unknown): Promise<T> {
  const response = await fetch("/api/public/" + resource, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new ApiError(result.error, result.code);
  return result;
}
type Draft = {
  serviceId: number;
  day: string;
  time: string;
  step: number;
  key: string;
  month: string;
  receiptKey?: string;
  started?: boolean;
};
const storageKey = "agenda-booking-draft-v1";
export default function PublicBooking() {
  const [catalog, setCatalog] = useState<PublicBootstrap | null>(null),
    [step, setStep] = useState(0),
    [started, setStarted] = useState(false),
    [serviceId, setServiceId] = useState(0),
    [day, setDay] = useState(""),
    [time, setTime] = useState(""),
    [month, setMonth] = useState("");
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [website, setWebsite] = useState(""),
    [notifications, setNotifications] = useState(false),
    [invitations, setInvitations] = useState(false),
    [identified, setIdentified] = useState(false),
    [slots, setSlots] = useState<PublicAvailability>({
      profissional: null,
      dias: [],
    });
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState<PublicReceipt | null>(null),
    [key, setKey] = useState("");
  const [revision, setRevision] = useState(0),
    [ready, setReady] = useState(false);
  // Uma faixa de horarios por vez evita a pagina rolar no celular.
  const [timePeriod, setTimePeriod] = useState<0 | 1>(0);
  const title = useRef<HTMLHeadingElement>(null),
    mounted = useRef(false),
    requestId = useRef(0);
  const service = catalog?.servicos.find((s) => s.id === serviceId);
  const boot = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const data = await call<PublicBootstrap>("bootstrap", {});
      setCatalog(data);
      let draft: Partial<Draft> = {};
      try {
        draft = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}");
      } catch {}
      setMonth(
        data.meses.includes(draft.month ?? "") ? draft.month! : data.meses[0],
      );
      setStarted(Boolean(draft.started || draft.serviceId || draft.receiptKey));
      setKey(typeof draft.key === "string" ? draft.key : crypto.randomUUID());
      if (data.servicos.some((s) => s.id === draft.serviceId)) {
        setServiceId(draft.serviceId!);
        setDay(draft.day ?? "");
        setTime(draft.time ?? "");
        setStep(
          Math.max(0, Math.min(draft.step ?? 0, data.identidade ? 4 : 3)),
        );
      }
      if (data.identidade) {
        setName(data.identidade.nome);
        setPhone(data.identidade.whatsapp);
        setNotifications(Boolean(data.identidade.permiteNotificacoes));
        setInvitations(Boolean(data.identidade.permiteConvites));
        setIdentified(true);
      }
      if (draft.receiptKey) {
        try {
          setReceipt(
            await call<PublicReceipt>("receipt", { chave: draft.receiptKey }),
          );
        } catch {
          setError(
            "O comprovante desta sessão expirou. Se você já confirmou, fale com a barbearia antes de agendar novamente.",
          );
        }
      }
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      void boot();
    }
  }, [boot]);
  useEffect(() => {
    if (!ready) return;
    const draft: Draft = {
      serviceId,
      day,
      time,
      step,
      key,
      month,
      ...(receipt ? { receiptKey: key } : {}),
      started,
    };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {}
  }, [ready, serviceId, day, time, step, key, month, receipt, started]);
  useEffect(() => {
    if (!serviceId || !month || !catalog || receipt) return;
    const sequence = ++requestId.current;
    let active = true;
    setLoading(true);
    call<PublicAvailability>("availability", {
      servicoId: serviceId,
      from: catalog.hoje,
      days: 7,
    })
      .then((value) => {
        if (active && sequence === requestId.current) setSlots(value);
      })
      .catch((e) => {
        if (active) {
          setSlots({ profissional: null, dias: [] });
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [serviceId, month, catalog, identified, revision, receipt]);
  useEffect(() => {
    const refresh = () => setRevision((v) => v + 1);
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 20000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  function go(value: number) {
    setStep(value);
    setError("");
    setTimeout(() => title.current?.focus(), 0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function change() {
    setKey(crypto.randomUUID());
  }
  async function identify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await call("identify", { nome: name, whatsapp: phone, website, permiteNotificacoes: notifications, permiteConvites: invitations });
      setIdentified(true);
      change();
      const result = await call<PublicAvailability>("availability", {
        servicoId: serviceId,
        from: day,
        days: 1,
      });
      setSlots(result);
      setRevision((v) => v + 1);
      if (!result.dias[0]?.horarios.includes(time)) {
        setTime("");
        setStep(2);
        setError(
          "Seu atendimento será com " +
            result.profissional?.nome +
            ". Escolha um horário disponível nessa agenda.",
        );
      } else go(4);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!service || !slots.profissional || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await call<PublicReceipt>("booking", {
        nome: name,
        whatsapp: phone,
        servicoId: serviceId,
        data: day,
        horario: time,
        profissionalId: slots.profissional.id,
        precoCentavos: service.precoCentavos,
        duracao: service.duracao,
        chave: key,
        website,
      });
      // Persist recovery key before rendering success, including a network retry after reload.
      try {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({
            serviceId,
            day,
            time,
            step,
            key,
            month,
            receiptKey: key,
          }),
        );
      } catch {}
      setReceipt(result);
      const channel = new BroadcastChannel("agenda-barbearia");
      channel.postMessage("changed");
      channel.close();
      window.scrollTo({ top: 0 });
    } catch (e) {
      const failure = e as ApiError;
      setError(failure.message);
      if (failure.code === "IDENTITY") { setIdentified(false); setStep(3); change(); }
      if (failure.code === "SLOT") {
        setTime("");
        setStep(2);
        change();
        setRevision((v) => v + 1);
      }
      if (failure.code === "SERVICE") {
        const data = await call<PublicBootstrap>("bootstrap", {});
        setCatalog(data);
        setStep(0);
        change();
      }
    } finally {
      setBusy(false);
    }
  }
  function calendarDownload() {
    if (!receipt) return;
    const stamp = (v: string) => v.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const escape = (v: string) =>
      v
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
    const file = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Sistema de Agendamento para Barbearias//Agenda//PT-BR",
      "BEGIN:VEVENT",
      "UID:" + receipt.protocolo + "@agenda.invalid",
      "DTSTAMP:" + stamp(new Date().toISOString()),
      "DTSTART:" + stamp(receipt.inicio),
      "DTEND:" + stamp(receipt.fim),
      "SUMMARY:" + escape("Sistema de Agendamento para Barbearias · " + receipt.servico),
      "DESCRIPTION:" + escape("Atendimento com " + receipt.profissional),
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([file], { type: "text/calendar;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "agendamento-barbearia.ics";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const selectedDay = slots.dias.find((d) => d.data === day);
  const available = selectedDay?.horarios ?? [];
  const melhoresEncaixes = selectedDay?.melhoresEncaixes ?? [];
  const morningTimes = available.filter((t) => t < "12:00");
  const afternoonTimes = available.filter((t) => t >= "12:00");
  const visibleTimePeriod =
    (timePeriod === 0 && morningTimes.length) ||
    (timePeriod === 1 && afternoonTimes.length)
      ? timePeriod
      : morningTimes.length ? 0 : 1;
  const visualStage = step === 0 ? 0 : step <= 2 ? 1 : 2;
  const publicLogo = "/logo-agenda.svg";
  const imageForService = (value: string) => {
    const normalized = value.toLocaleLowerCase("pt-BR");
    if (normalized.includes("barba") && (normalized.includes("cabelo") || normalized.includes("corte"))) return "/servico-combo.svg";
    if (normalized.includes("barba")) return "/servico-barba.svg";
    return "/servico-corte.svg";
  };

  const canNext =
    step === 0
      ? !!service
      : step === 1
        ? !!day && slots.dias.some((d) => d.data === day)
        : !!time && available.includes(time);
  const next = () => go(step === 2 && identified ? 4 : step + 1);
  function summary(r: PublicReceipt | undefined) {
    return (
      <div className="pb-details">
        <div>
          <Scissors />
          <dl className="pb-detail-copy">
            <dt>Serviço</dt>
            <dd>{r?.servico ?? service?.nome}</dd>
          </dl>
          {!r && <button onClick={() => go(0)}>Alterar serviço</button>}
        </div>
        <div>
          <CalendarDays />
          <dl className="pb-detail-copy">
            <dt>Data</dt>
            <dd>{dayLabel(r?.data ?? day)}</dd>
          </dl>
          {!r && <button onClick={() => go(1)}>Alterar data</button>}
        </div>
        <div>
          <Clock3 />
          <dl className="pb-detail-copy">
            <dt>Horário</dt>
            <dd>
              {r?.horario ?? time}{" "}
              <small>· {r?.duracao ?? service?.duracao} minutos</small>
            </dd>
          </dl>
          {!r && <button onClick={() => go(2)}>Alterar horário</button>}
        </div>
        <div>
          <UserRound />
          <dl className="pb-detail-copy">
            <dt>Profissional</dt>
            <dd>
              {r?.profissional ?? slots.profissional?.nome ?? "Conferindo…"}
            </dd>
          </dl>
        </div>
        <div>
          <ShieldCheck />
          <dl className="pb-detail-copy">
            <dt>Cliente</dt>
            <dd>{r?.nome ?? name}</dd>
          </dl>
          {!r && <button onClick={() => go(3)}>Alterar dados</button>}
        </div>
        <div className="pb-total">
          <span>Valor do atendimento</span>
          <strong>
            {currency(r?.precoCentavos ?? service?.precoCentavos ?? 0)}
          </strong>
        </div>
      </div>
    );
  }
  return (
    <div className={"pb-page " + (!started && !receipt ? "pb-intro-mode" : "pb-started-mode") + (receipt ? " pb-receipt-mode" : "") + (started && !receipt && step === 3 ? " pb-identity-mode" : "")}>
      <header className="pb-header">
        {started && !receipt && (
          <button className="pb-header-back" aria-label="Voltar" onClick={() => step === 0 ? setStarted(false) : go(step - 1)} disabled={busy}>
            <ArrowLeft size={22} />
          </button>
        )}
        <a href="/agendar" aria-label="Sistema de Agendamento para Barbearias — agendamento">
          <Image
            src={publicLogo}
            width={65}
            height={70}
            alt="Sistema de Agendamento para Barbearias"
            priority
          />
          <span>
            AGENDA <small>BARBEARIA</small>
          </span>
        </a>
        <span className="pb-header-note">
          <ShieldCheck size={16} /> Agendamento online
        </span>
      </header>
      <main className="pb-layout">
        <aside className="pb-brand">
          <div className="pb-brand-mark">
            <Image
              src={publicLogo}
              width={177}
              height={190}
              alt=""
              priority
            />
          </div>
          <span className="pb-eyebrow">SEU ESTILO. SUA IDENTIDADE.</span>
          <h1>
            Um momento seu.
            <br />
            <em>Seu estilo, seu horário.</em>
          </h1>
          <p>
            O cuidado que você conhece, com a facilidade de agendar onde
            estiver.
          </p>
          <div className="pb-brand-line" />
          <div className="pb-promises">
            <span>
              <Scissors /> Cuidado em cada detalhe
            </span>
            <span>
              <Crown /> Profissionais experientes
            </span>
            <span>
              <Clock3 /> Seu horário, sem complicação
            </span>
          </div>
          <small>
            Sistema de Agendamento para Barbearias <span>•</span> ESTILO COM PERSONALIDADE
          </small>
        </aside>
        <section
          className={"pb-booking" + (step === 4 && !receipt ? " pb-review-stage" : "")}
          aria-label="Agendamento público"
          aria-busy={busy}
        >
          {!started && !receipt ? (
            <div className="pb-intro">
              <div className="pb-intro-photo" aria-hidden="true" />
              <div className="pb-intro-content">
                <Image className="pb-intro-logo" src={publicLogo} width={232} height={270} alt="Sistema de Agendamento para Barbearias — Desde 2014" priority />
                <h1>Agende seu horário</h1>
                <p>Rápido, prático e sem complicação.</p>
                <div className="pb-intro-benefits" aria-label="Vantagens da Sistema de Agendamento para Barbearias">
                  <div><BadgeCheck /><span>Atendimento<br/>de qualidade</span></div>
                  <div><UserRound /><span>Profissionais<br/>experientes</span></div>
                  <div><Shirt /><span>Ambiente<br/>moderno</span></div>
                </div>
                {error && (
                  <div className="pb-error" role="alert">
                    {error}
                    <button type="button" onClick={() => void boot()}>Tentar novamente</button>
                  </div>
                )}
                <button className="pb-primary pb-intro-action" disabled={busy || !catalog} onClick={() => { setStarted(true); go(0); }}>
                  <CalendarCheck2 size={22}/> AGENDAR AGORA <ArrowRight size={22}/>
                </button>
              </div>
            </div>
          ) : receipt ? (
            <div className={"pb-success" + (
  receipt.status === "Cancelado" ||
  receipt.status === "Concluído"
    ? ""
    : " pb-success-v3"
)}>
              <div className="pb-success-icon">
                {receipt.status === "Cancelado" ? (
                  <CalendarDays size={40} />
                ) : (
                  <Check size={40} />
                )}
              </div>
              <span className="pb-eyebrow">COMPROVANTE DO SEU AGENDAMENTO</span>
              <h2 tabIndex={-1} ref={title}>
                {receipt.status === "Cancelado"
                  ? "Agendamento cancelado"
                  : receipt.status === "Concluído"
                    ? "Atendimento concluído"
                    : "Horário reservado!"}
              </h2>
              <p>
                {receipt.status === "Cancelado"
                  ? "Este atendimento foi cancelado pela barbearia."
                  : "Seu agendamento está salvo na Sistema de Agendamento para Barbearias."}
              </p>
              {summary(receipt)}
              <button
                className="pb-primary"
                disabled={receipt.status === "Cancelado"}
                onClick={calendarDownload}
              >
                <Download size={19} /> Adicionar ao calendário
              </button>
              <button
                className="pb-secondary"
                onClick={() => {
                  setReceipt(null);
                  setDay("");
                  setTime("");
                  change();
                  go(0);
                  setRevision((v) => v + 1);
                }}
              >
                Fazer outro agendamento
              </button>
              <p className="pb-info">
                Guarde este comprovante. Para alterar ou cancelar, fale com a
                barbearia pelo contato que enviou este link.
              </p>
              <small className="pb-protocol">
                Protocolo: {receipt.protocolo}
              </small>
            </div>
          ) : (
            <>
              <div className="pb-top">
                <span className="pb-eyebrow">AGENDE SEU HORÁRIO</span>
                <span>{step + 1} de 5</span>
              </div>
              <ol className="pb-progress" aria-label="Etapas do agendamento">
                {["Serviço", "Horário", "Confirmar"].map((label, i) => (
                  <li
                    key={label}
                    aria-current={visualStage === i ? "step" : undefined}
                    className={visualStage >= i ? "active" : ""}
                  >
                    <button
                      disabled={i >= visualStage || busy}
                      aria-label={"Voltar para " + label}
                      onClick={() => go(i === 0 ? 0 : i === 1 ? 1 : 3)}
                    >
                      <span>{visualStage > i ? <Check size={15} /> : i + 1}</span>
                      <small>{label}</small>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="pb-heading">
                <h2 ref={title} tabIndex={-1}>
                  {
                    [
                      "O que deseja fazer?",
                      "Escolha seu dia.",
                      "Qual o melhor horário?",
                      "Como podemos te chamar?",
                      "Confira seu agendamento.",
                    ][step]
                  }
                </h2>
                <p>
                  {
                    [
                      "Escolha o cuidado que combina com você.",
                      "Datas disponíveis para o serviço escolhido.",
                      slots.profissional
                        ? "Atendimento com " +
                          slots.profissional.nome +
                          ". Horários de Brasília."
                        : "Escolha um horário. A agenda do seu profissional será conferida após seus dados.",
                      "Só precisamos de duas informações para reservar.",
                      "Está tudo certo? Seu próximo atendimento está a um toque.",
                    ][step]
                  }
                </p>
              </div>
              {error && (
                <div className="pb-error" role="alert">
                  {error}
                  <button
                    onClick={() => {
                      setError("");
                      if (!catalog) void boot();
                      else setRevision((v) => v + 1);
                    }}
                  >
                    Tentar novamente
                  </button>
                </div>
              )}
              {!catalog && (
                <p role="status">
                  {busy
                    ? "Preparando sua experiência…"
                    : "Não foi possível carregar a agenda."}
                </p>
              )}
              {catalog && (step === 1 || step === 2) && service && (
                <div className="pb-current-service">
                  <Image src={imageForService(service.nome)} width={48} height={48} alt="" />
                  <div><strong>{service.nome}</strong><small>{currency(service.precoCentavos)} · {service.duracao} min</small></div>
                  <button type="button" onClick={() => go(0)}>Alterar</button>
                </div>
              )}
              {catalog && step === 0 && (
                <div className="pb-services">
                  {catalog.servicos.map((s) => (
                    <button
                      key={s.id}
                      className={
                        "pb-service " + (serviceId === s.id ? "selected" : "")
                      }
                      aria-pressed={serviceId === s.id}
                      onClick={() => {
                        if (serviceId !== s.id) {
                          setServiceId(s.id);
                          setTime("");
                          change();
                        }
                      }}
                    >
                      <span className="pb-service-art">
                        <Image src={imageForService(s.nome)} fill sizes="(max-width: 760px) 94px, 90px" alt="" />
                      </span>
                      <span className="pb-service-copy">
                        <strong>{s.nome.toLocaleLowerCase("pt-BR")}</strong>
                        <span>{currency(s.precoCentavos)}</span>
                        <small>
                          <Clock3 size={13} />
                          {s.duracao} minutos
                        </small>
                      </span>
                      <span className="pb-radio">
                        {serviceId === s.id ? <Check size={15} /> : <ArrowRight size={17} />}
                      </span>
                    </button>
                  ))}
                  {!catalog.servicos.length && (
                    <p className="pb-info">
                      Não há serviços disponíveis agora. Fale com a barbearia.
                    </p>
                  )}
                </div>
              )}
              {catalog && step === 1 && (
                <div className="pb-calendar">
                  {/* AGENDA VISUAL SEMANAL V4 — sem calendario mensal */}
                  <div className="pb-weekly-head">
                    <h3>Dias disponíveis desta semana</h3>
                    <p>Escolha um dia para ver os horários livres.</p>
                  </div>
                  <div className="pb-weekly-banner" role="note">
                    <CalendarDays aria-hidden="true" size={21} />
                    <span>Agendamentos são feitos somente para a semana atual. <strong>Toda segunda-feira liberamos a próxima semana.</strong></span>
                  </div>
                  <div className="pb-weekly-grid" role="group" aria-label="Dias da semana atual">
                    {(["TER", "QUA", "QUI", "SEX", "SÁB"] as const).map((label, i) => {
                      // weekday() usa domingo=0; trata domingo como 7.
                      // A API (horario de Sao Paulo) devolve a data atual.
                      const date = addDays(catalog.hoje, i + 2 - (weekday(catalog.hoje) || 7));
                      const eligible = slots.dias.some((d) => d.data === date && d.horarios.length > 0);
                      const selected = date === day;
                      const past = date < catalog.hoje;
                      return (
                        <button
                          type="button"
                          key={date}
                          className={`pb-weekly-day${selected ? " is-selected" : ""}`}
                          aria-label={`${dayLabel(date)}, ${eligible ? "disponível" : past ? "encerrado" : "sem horários"}`}
                          aria-pressed={selected}
                          disabled={!eligible || loading}
                          onClick={() => {
                            if (day !== date) {
                              setDay(date);
                              setTime("");
                              change();
                            }
                          }}
                        >
                          <span className="pb-weekly-weekday">{label}</span>
                          <strong className="pb-weekly-number">{date.slice(8)}</strong>
                          <span className="pb-weekly-month">{new Date(date + "T12:00:00Z").toLocaleDateString("pt-BR", {month:"short", timeZone:"UTC"})}</span>
                          <span className="pb-weekly-dot" aria-hidden="true" />
                          <span className="pb-weekly-status">{eligible ? "Disponível" : past ? "Passou" : "Sem vaga"}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="pb-info">
                    Somente datas com vagas disponíveis podem ser selecionadas.
                  </p>
                  {!loading && !slots.dias.length && (
                    <p role="status" className="pb-empty">
                      Sem horários disponíveis nesta semana para este serviço. A próxima semana abre na segunda-feira.
                    </p>
                  )}
                </div>
              )}
              {catalog && step === 2 && (
                <>
                  <button className="pb-date-chip" onClick={() => go(1)}>
                    <CalendarDays size={18} />
                    {day ? dayLabel(day) : "Escolha uma data"}
                    <ChevronRight size={16} />
                  </button>
                  {!!available.length && (
                    <>
                      <div className="pb-time-periods" role="group" aria-label="Período do atendimento">
                        {(["Manhã", "Tarde e noite"] as const).map((label, index) => {
                          const times = index === 0 ? morningTimes : afternoonTimes;
                          return (
                            <button
                              key={label}
                              type="button"
                              disabled={loading || !times.length}
                              aria-pressed={visibleTimePeriod === index}
                              className={visibleTimePeriod === index ? "active" : ""}
                              onClick={() => {
                                setTimePeriod(index as 0 | 1);
                                setTime("");
                                change();
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="pb-time-group pb-time-group-visible">
                        <div className="pb-times">
                          {(visibleTimePeriod === 0 ? morningTimes : afternoonTimes).map((t) => (
                            <button
                              key={t}
                              disabled={loading}
                              aria-pressed={time === t}
                              className={[
                                time === t ? "selected" : "",
                                melhoresEncaixes.includes(t) ? "pb-best-fit" : "",
                              ].filter(Boolean).join(" ")}
                              aria-label={melhoresEncaixes.includes(t) ? `${t}, melhor encaixe` : t}
                              onClick={() => {
                                setTime(t);
                                change();
                              }}
                            >
                              <span>{t}</span>
                              {melhoresEncaixes.includes(t) && (
                                <small className="pb-best-fit-label">★ Melhor</small>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                  {!loading && !available.length && (
                    <div className="pb-empty">
                      <Clock3 />
                      <p>
                        Não há horários disponíveis neste dia para seu
                        atendimento.
                      </p>
                      <button onClick={() => go(1)}>Escolher outra data</button>
                    </div>
                  )}
                  <p className="pb-info">
                    O horário fica reservado após sua confirmação.
                  </p>
                </>
              )}
              {catalog && step === 3 && (
                <form
                  id="public-identity"
                  className="pb-identity"
                  onSubmit={identify}
                >
                  <label>
                    Nome completo
                    <input
                      autoComplete="name"
                      maxLength={100}
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setIdentified(false);
                      }}
                      placeholder="Seu nome e sobrenome"
                      required
                      minLength={5}
                    />
                  </label>
                  <label>
                    WhatsApp com DDD
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      maxLength={24}
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setNotifications(false);
                        setInvitations(false);
                        setIdentified(false);
                      }}
                      placeholder="(43) 99999-9999"
                      required
                    />
                  </label>
                  <div className="pb-trap" aria-hidden="true">
                    <label>
                      Website
                      <input
                        tabIndex={-1}
                        autoComplete="off"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="pb-opt-in">
                    <input type="checkbox" checked={notifications} onChange={(e) => {
                      setNotifications(e.target.checked);
                      setIdentified(false);
                    }} />
                    <span>Quero receber a confirmação e o lembrete deste agendamento pelo WhatsApp da Sistema de Agendamento para Barbearias.</span>
                  </label>
                  <label className="pb-opt-in">
                    <input type="checkbox" checked={invitations} onChange={(e) => {
                      setInvitations(e.target.checked);
                      setIdentified(false);
                    }} />
                    <span>Quero receber convites da Sistema de Agendamento para Barbearias para agendar nas segundas-feiras.</span>
                  </label>
                  <p className="pb-consent-note">As opções são facultativas. Para parar as mensagens, responda SAIR no WhatsApp.</p>
                  <div className="pb-privacy">
                    <ShieldCheck size={23} />
                    <p>
                      Usamos seu nome e WhatsApp para registrar e organizar este
                      atendimento. Seus dados não ficam visíveis para outros
                      clientes. Para corrigir ou solicitar a exclusão de seus
                      dados, fale com a Sistema de Agendamento para Barbearias.
                    </p>
                  </div>
                </form>
              )}
              {catalog && step === 4 && service && day && summary(undefined)}
              {loading && step > 0 && step !== 3 && (
                <p className="pb-loading" role="status">
                  Consultando a agenda…
                </p>
              )}
              {catalog && (
                <div className="pb-actions">
                  {step > 0 && (
                    <button
                      className="pb-back"
                      disabled={busy}
                      onClick={() => go(step - 1)}
                      aria-label="Voltar"
                    >
                      <ArrowLeft size={20} />
                    </button>
                  )}
                  {step < 3 ? (
                    <button
                      className="pb-primary"
                      disabled={!canNext || busy || (step > 0 && loading)}
                      onClick={next}
                    >
                      Continuar <ArrowRight size={19} />
                    </button>
                  ) : step === 3 ? (
                    <button
                      className="pb-primary"
                      type="submit"
                      form="public-identity"
                      disabled={busy}
                    >
                      {busy ? "Conferindo…" : "Revisar agendamento"}
                      <ArrowRight size={19} />
                    </button>
                  ) : (
                    <button
                      className="pb-primary"
                      onClick={confirm}
                      disabled={busy || loading || !slots.profissional}
                    >
                      {busy
                        ? "Reservando seu horário…"
                        : "Confirmar agendamento"}
                      <Check size={20} />
                    </button>
                  )}
                </div>
              )}
              <div className="pb-footer-note">
                <ShieldCheck size={14} /> Sem conta. Sem complicação.
              </div>
            </>
          )}
        </section>
      </main>
      <footer className="pb-footer">
        Sistema de Agendamento para Barbearias <span>•</span> Feito para cuidar do seu estilo.
      </footer>
    </div>
  );
}
