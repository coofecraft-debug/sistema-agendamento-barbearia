"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crown,
  House,
  LogOut,
  Plus,
  RefreshCw,
  Scissors,
  Search,
  Settings2,
  Users,
  UserRound,
} from "lucide-react";
import type {
  Appointment,
  Bootstrap,
  Client,
  DayAvailability,
  Service,
} from "@/lib/types";
import { addDays, dayLabel, localTime, monday, today } from "@/lib/time";
import { api, Badge, Empty, money } from "./shared";
import Booking, { type BookingPreset } from "./booking";
import { AppointmentDetail, ClientEditor, ServiceEditor } from "./editors";
import Settings from "./settings";
type Page =
  "dashboard" | "agenda" | "available" | "clients" | "services" | "settings";
const navigation = [
  { id: "dashboard", label: "Início", icon: House },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "clients", label: "Clientes", icon: Users },
  { id: "services", label: "Serviços", icon: Scissors },
  { id: "settings", label: "Ajustes", icon: Settings2 },
] as const;
const titles: Record<Page, [string, string]> = {
  dashboard: ["Dashboard", "Visão rápida do dia, sem perder tempo."],
  agenda: ["Agenda", "Todos os agendamentos em ordem de horário."],
  available: [
    "Horários disponíveis",
    "Veja os horários livres e agende em um toque.",
  ],
  clients: ["Clientes", "Relacionamento e histórico em um só lugar."],
  services: ["Serviços", "Edite preços e duração rapidamente."],
  settings: ["Configurações", "Horários e organização em poucos toques."],
};
// Datas locais de São Paulo: agrupar por dia UTC deslocaria atendimentos próximos da meia-noite.
const shortAgendaDay = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  })
    .format(new Date(`${date}T12:00:00-03:00`))
    .replace(".", "")
    .toUpperCase();

const bookingDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));

export default function Admin() {
  const [page, setPage] = useState<Page>("dashboard"),
    [data, setData] = useState<Bootstrap | null>(null),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [day, setDay] = useState(today()),
    [week, setWeek] = useState(monday(today())),
    [pro, setPro] = useState(0),
    [service, setService] = useState(0),
    [appointments, setAppointments] = useState<Appointment[]>([]),
    [daily, setDaily] = useState<Appointment[]>([]),
    [availability, setAvailability] = useState<DayAvailability[]>([]),
    [daySlots, setDaySlots] = useState<DayAvailability[]>([]),
    [dayLoading, setDayLoading] = useState(true),
    [weekLoading, setWeekLoading] = useState(false);
  // Only show a loading placeholder when the selected day/filter changes.
  // Silent refreshes must keep the agenda mounted to preserve scroll position.
  const lastDayQuery = useRef("");
  const lastWeekQuery = useRef("");
  const [agendaMode, setAgendaMode] = useState<"list" | "day">("list");
  const [agendaPeriod, setAgendaPeriod] = useState<1 | 7 | 30>(7);
  const [agendaStatus, setAgendaStatus] = useState("ativos");
  const [periodAppointments, setPeriodAppointments] = useState<Appointment[]>([]);
  const [periodLoading, setPeriodLoading] = useState(true);
  const lastPeriodQuery = useRef("");
  const [clientFilter, setClientFilter] = useState<"all" | "recurring" | "new">("all");
  const [clientSortAsc, setClientSortAsc] = useState(true);
  const [sortServicesAZ, setSortServicesAZ] = useState(false);
  const [query, setQuery] = useState(""),
    [clients, setClients] = useState<Client[]>([]),
    [booking, setBooking] = useState<BookingPreset | null>(null),
    [clientEdit, setClientEdit] = useState<Client | "new" | null>(null),
    [serviceEdit, setServiceEdit] = useState<Service | "new" | null>(null),
    [detail, setDetail] = useState<Appointment | null>(null),
    [newBookingClient, setNewBookingClient] = useState<Client | null>(null);
  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  useEffect(() => {
    let live = true;
    api<Bootstrap>("bootstrap")
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [revision]);
  useEffect(() => {
    if (day === today()) return;
    let live = true;
    api<Appointment[]>(`appointments?from=${today()}&days=1`)
      .then((d) => {
        if (live) setDaily(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [revision, day]);
  useEffect(() => {
    let live = true;
    const queryKey = `${day}|${service}`;
    if (lastDayQuery.current !== queryKey) setDayLoading(true);
    lastDayQuery.current = queryKey;
    Promise.all([
      api<Appointment[]>(`appointments?from=${day}&days=1`),
      api<DayAvailability[]>(
        `availability?from=${day}&days=1${service ? "&service=" + service : ""}`,
      ),
    ])
      .then(([a, s]) => {
        if (live) {
          setAppointments(a);
          if (day === today()) setDaily(a);
          setDaySlots(s);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setDayLoading(false);
      });
    return () => {
      live = false;
    };
  }, [day, service, revision]);
  // Atualização silenciosa: mantém a lista visível durante cada consulta de 10 segundos.
  useEffect(() => {
    if (page !== "agenda" || agendaMode !== "list") return;
    let live = true;
    const key = `${today()}|${agendaPeriod}`;
    if (lastPeriodQuery.current !== key) {
      setPeriodLoading(true);
      setPeriodAppointments([]);
    }
    lastPeriodQuery.current = key;
    api<Appointment[]>(`appointments?from=${today()}&days=${agendaPeriod}`)
      .then((items) => {
        if (live) setPeriodAppointments(items);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setPeriodLoading(false);
      });
    return () => {
      live = false;
    };
  }, [page, agendaMode, agendaPeriod, revision]);
  useEffect(() => {
    if (page !== "available") return;
    let live = true;
    const queryKey = `${week}|${service}|${pro}`;
    // Keep existing slots on periodic refresh: clearing them jumps the page up.
    if (lastWeekQuery.current !== queryKey) {
      setWeekLoading(true);
      setAvailability([]);
    }
    lastWeekQuery.current = queryKey;
    api<DayAvailability[]>(
      `availability?grid=public&from=${week}&days=7${service ? "&service=" + service : ""}${pro ? "&professional=" + pro : ""}`,
    )
      .then((a) => {
        if (live) setAvailability(a);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setWeekLoading(false);
      });
    return () => {
      live = false;
    };
  }, [week, service, pro, revision, page]);
  useEffect(() => {
    if (page !== "clients") return;
    let live = true;
    const timer = setTimeout(
      () =>
        api<Client[]>(`clients?q=${encodeURIComponent(query)}`)
          .then((c) => {
            if (live) setClients(c);
          })
          .catch((e) => {
            if (live) setError(e.message);
          }),
      200,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, revision, page]);
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const channel = new BroadcastChannel("agenda-barbearia");
    channel.onmessage = refresh;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 10000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
      channel.close();
    };
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  function saved(message = "Alterações salvas.") {
    refresh();
    setNotice(message);
  }
  function go(next: Page) {
    setPage(next);
    setError("");
    window.scrollTo({ top: 0 });
  }
  const visiblePros =
    data?.profissionais.filter((p) => p.ativo && p.papel === "dono" && (!pro || p.id === pro)) ?? [];
  const activeDaily = daily.filter((a) => a.status !== "Cancelado");
  const confirmedToday = daily.filter((a) => a.status === "Confirmado").length;
  const forecastToday = activeDaily
    .filter((a) => a.status !== "Faltou")
    .reduce((total, a) => total + a.preco_centavos, 0);
  const agendaItems = periodAppointments
    .filter((a) => !pro || a.profissional_id === pro)
    .filter((a) =>
      agendaStatus === "todos"
        ? true
        : agendaStatus === "ativos"
          ? a.status !== "Cancelado"
          : a.status === agendaStatus,
    )
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
  const agendaDates = [...new Set(agendaItems.map((a) => bookingDay(a.inicio)))];
  const agendaWeek = Array.from({ length: 7 }, (_, i) => addDays(today(), i));
  const upcoming = daily
    .filter(
      (a) =>
        ["Agendado", "Confirmado"].includes(a.status) &&
        new Date(a.fim) > new Date(),
    )
    .slice(0, 5);
  if (!data)
    return (
      <main className="login">
        <div className="panel">
          <h1>Sistema de Agendamento para Barbearias</h1>
          <p>{error || "Preparando sua agenda…"}</p>
          {error && <button onClick={refresh}>Tentar novamente</button>}
        </div>
      </main>
    );
  const filters = (
    <>
      <div className="segmented filters">
        <button className={!pro ? "active" : ""} onClick={() => setPro(0)}>
          <Users size={17} /> Todos
        </button>
        {data.profissionais.filter((p) => p.ativo && p.papel === "dono").map((p) => (
          <button
            className={pro === p.id ? "active" : ""}
            key={p.id}
            onClick={() => setPro(p.id)}
          >
            {p.papel === "dono" ? <Crown size={17} /> : <UserRound size={17} />}{" "}
            {p.nome}
          </button>
        ))}
      </div>
      <label className="service-filter">
        Disponibilidade para
        <select
          value={service}
          onChange={(e) => setService(Number(e.target.value))}
        >
          <option value={0}>Escolher serviço · prévia de 30 min</option>
          {data.servicos
            .filter((s) => s.ativo)
            .map((s) => (
              <option value={s.id} key={s.id}>
                {s.nome} · {s.duracao} min
              </option>
            ))}
        </select>
      </label>
      {!service && (
        <p className="hint">
          <Clock size={15} /> Prévia de 30 minutos. Os horários podem mudar ao
          escolher o serviço.
        </p>
      )}
    </>
  );
  function appointmentCard(a: Appointment) {
    return (
      <button
        className={`appointment-card ${a.profissional_id === data!.profissionais.find((p) => p.papel === "dono")?.id ? "owner" : "employee"}`}
        key={a.id}
        onClick={() => setDetail(a)}
      >
        <time>{localTime(a.inicio)}</time>
        <span className="appointment-name">
          <strong>{a.cliente}</strong>
          <small>
            {a.servico} ·{" "}
            {data!.profissionais.find((p) => p.id === a.profissional_id)?.nome}
          </small>
        </span>
        <Badge status={a.status} />
      </button>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <Image
            src="/logo-agenda.svg"
            width={55}
            height={59}
            alt="Logo Sistema de Agendamento para Barbearias"
            priority
          />
          <span>
            AGENDA<span>BARBEARIA</span>
          </span>
        </Link>
        <p className="eyebrow">PAINEL ADMINISTRATIVO</p>
        <nav>
          {navigation.map((n) => (
            <button
              key={n.id}
              className={
                page === n.id || (n.id === "agenda" && page === "available")
                  ? "active"
                  : ""
              }
              onClick={() => go(n.id)}
            >
              <n.icon size={20} />
              {n.label}
            </button>
          ))}
          <button
            className={page === "available" ? "active" : ""}
            onClick={() => go("available")}
          >
            <Clock size={20} /> Horários livres
          </button>
        </nav>
        <div className="sidebar-foot">
          <span className="live-dot" /> Sua agenda em dia
          <small>Sistema de Agendamento para Barbearias · Administração</small>
        </div>
      </aside>
      <div className={`workspace${page === "dashboard" ? " bf-dashboard-workspace" : page === "agenda" ? " bf-agenda-workspace" : ""}`}>
        <header className="topbar">
          <div className="mobile-brand">
            <Image
              src="/logo-agenda.svg"
              width={43}
              height={46}
              alt="Sistema de Agendamento para Barbearias"
              priority
            />
            <span>
              <strong>Sistema de Agendamento para Barbearias</strong>
              <small>PAINEL ADMINISTRATIVO</small>
            </span>
          </div>
          <span className="desktop-welcome">
            Olá, {data.nome}. <span>Bom trabalho por aqui.</span>
          </span>
          <div className="topbar-right">
            <span className="date-label">{dayLabel(data.hoje)}</span>
            <button
              className="avatar"
              aria-label="Atualizar agenda"
              onClick={refresh}
            >
              D
            </button>
            <button
              className="icon-button"
              aria-label="Sair"
              onClick={async () => {
                try {
                  const r = await fetch("/api/auth", { method: "DELETE" });
                  if (!r.ok) throw new Error("Não foi possível sair.");
                  window.location.assign("/login");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main>
          {page !== "dashboard" && (
            <div className={page === "clients" ? "page-heading bf-clients-heading" : page === "services" ? "page-heading bf-services-heading" : "page-heading"}>
              <div>
                <span className="eyebrow">
                  BARBERFLOW <span className="eyebrow-line" />
                </span>
                <h1>{titles[page][0]}</h1>
                <p>{titles[page][1]}</p>
              </div>
              {page !== "settings" && (
                <button
                  className={page === "clients" ? "primary heading-action bf-clients-add" : page === "services" ? "primary heading-action bf-services-add" : "primary heading-action"}
                  onClick={() =>
                    page === "clients"
                      ? setClientEdit("new")
                      : page === "services"
                        ? setServiceEdit("new")
                        : setBooking({})
                  }
                >
                  <Plus size={19} />
                  {page === "clients"
                    ? "Novo cliente"
                    : page === "services"
                      ? "Novo serviço"
                      : "Agendar"}
                </button>
              )}
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <button
                onClick={() => {
                  setError("");
                  refresh();
                }}
              >
                <RefreshCw size={16} /> Tentar novamente
              </button>
            </div>
          )}
          {page === "dashboard" && (
            <div className="bf-dashboard">
              <div className="bf-dashboard-topline">
                <span>{dayLabel(data.hoje)}</span>
                <span className="bf-dashboard-sync">
                  <span className="bf-dashboard-live-dot" aria-hidden="true" />
                  Atualização automática
                </span>
              </div>

              <div className="bf-dashboard-title">
                <div>
                  <span className="eyebrow">
                    BARBERFLOW <span className="eyebrow-line" />
                  </span>
                  <h1>Bom dia, gestor!</h1>
                  <p>Tudo o que importa na sua barbearia.</p>
                </div>
                <button
                  type="button"
                  className="bf-dashboard-new"
                  aria-label="Criar agendamento"
                  title="Criar agendamento"
                  onClick={() => setBooking({})}
                >
                  <Plus size={29} aria-hidden="true" />
                </button>
              </div>

              <section className="bf-dashboard-summary" aria-label="Resumo do dia">
                <span className="bf-dashboard-overline">RESUMO DO DIA</span>
                <div className="bf-dashboard-summary-count">
                  <strong>{activeDaily.length}</strong>
                  <span>atendimentos</span>
                </div>
                <p className="bf-dashboard-next-time">
                  <CalendarDays size={17} aria-hidden="true" />
                  {upcoming.length
                    ? <>Próximo cliente às <strong>{localTime(upcoming[0].inicio)}</strong></>
                    : "Nenhum outro atendimento previsto para hoje"}
                </p>
                <div className="bf-dashboard-summary-bottom">
                  <div>
                    <strong>{money(forecastToday)}</strong>
                    <span>Previsão do dia</span>
                  </div>
                  <div>
                    <strong>{confirmedToday}</strong>
                    <span>Confirmados</span>
                  </div>
                </div>
              </section>

              <section className="bf-dashboard-links" aria-label="Acessos rápidos">
                <div className="bf-dashboard-section-title">
                  <h2>Acessos rápidos</h2>
                  <span>Mais usados</span>
                </div>
                <div className="bf-dashboard-link-grid">
                  <button type="button" onClick={() => { setDay(data.hoje); go("agenda"); }}>
                    <CalendarDays size={23} aria-hidden="true" />
                    <strong>Ver agenda</strong>
                    <small>Próximos horários</small>
                  </button>
                  <button type="button" onClick={() => setBooking({})}>
                    <Plus size={25} aria-hidden="true" />
                    <strong>Agendar</strong>
                    <small>Novo atendimento</small>
                  </button>
                  <button type="button" onClick={() => go("clients")}>
                    <Users size={23} aria-hidden="true" />
                    <strong>Clientes</strong>
                    <small>Consultar cadastro</small>
                  </button>
                  <button type="button" onClick={() => go("available")}>
                    <Clock size={23} aria-hidden="true" />
                    <strong>Horários livres</strong>
                    <small>Disponibilidade</small>
                  </button>
                </div>
              </section>

              <section className="bf-dashboard-upcoming" aria-label="Próximos atendimentos">
                <div className="bf-dashboard-section-title">
                  <h2>Próximos atendimentos</h2>
                  <button type="button" className="bf-dashboard-see-all" onClick={() => go("agenda")}>
                    Ver todos <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className="bf-dashboard-appointment-list">
                  {upcoming.length ? (
                    upcoming.map(appointmentCard)
                  ) : (
                    <div className="bf-dashboard-empty">
                      <CalendarDays size={25} aria-hidden="true" />
                      <p>Nenhum atendimento futuro para hoje.</p>
                      <button type="button" onClick={() => setBooking({})}>
                        <Plus size={17} aria-hidden="true" /> Agendar agora
                      </button>
                    </div>
                  )}
                </div>
              </section>

              <div className="bf-dashboard-other-stats" aria-label="Outros indicadores do dia">
                <span>Cancelados <strong>{daily.filter((a) => a.status === "Cancelado").length}</strong></span>
                <span>Concluídos <strong>{daily.filter((a) => a.status === "Concluído").length}</strong></span>
                <span>Faltas <strong>{daily.filter((a) => a.status === "Faltou").length}</strong></span>
              </div>
            </div>
          )}
          {page === "available" && (
            <>
              {filters}
              <div className="date-nav panel">
                <button
                  className="icon-button"
                  aria-label="Semana anterior"
                  onClick={() => setWeek(addDays(week, -7))}
                >
                  <ChevronLeft />
                </button>
                <span>
                  <CalendarDays size={20} />{" "}
                  {new Intl.DateTimeFormat("pt-BR", {
                    day: "numeric",
                    month: "short",
                  }).format(new Date(week + "T12:00:00"))}{" "}
                  –{" "}
                  {new Intl.DateTimeFormat("pt-BR", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  }).format(new Date(addDays(week, 6) + "T12:00:00"))}
                </span>
                <button
                  className="icon-button"
                  aria-label="Próxima semana"
                  onClick={() => setWeek(addDays(week, 7))}
                >
                  <ChevronRight />
                </button>
              </div>
              <button
                className="text-button"
                onClick={() => setWeek(monday(data.hoje))}
              >
                Voltar à semana atual
              </button>
              {weekLoading ? (
                <Empty>Consultando horários…</Empty>
              ) : (
                <div className="week-list">
                  {availability
                    .filter(
                      (a) =>
                        ![0, 1].includes(
                          new Date(a.data + "T12:00:00").getDay(),
                        ) || a.profissionais.some((p) => p.horarios.length),
                    )
                    .map((a) => (
                      <article className="week-day panel" key={a.data}>
                        <div className="day-marker">
                          <span>
                            {new Intl.DateTimeFormat("pt-BR", {
                              weekday: "short",
                            })
                              .format(new Date(a.data + "T12:00:00"))
                              .replace(".", "")}
                          </span>
                          <strong>{a.data.slice(8)}</strong>
                          <small>
                            {new Intl.DateTimeFormat("pt-BR", {
                              month: "short",
                            })
                              .format(new Date(a.data + "T12:00:00"))
                              .replace(".", "")}
                          </small>
                        </div>
                        <div className="day-availability">
                          {!a.liberado ? (
                            <p className="hint">
                              {a.data < data.hoje
                                ? "Data passada."
                                : "Sem expediente neste dia."}
                            </p>
                          ) : (
                            a.profissionais.filter((p) => data.profissionais.some((x) => x.id === p.id && x.ativo && x.papel === "dono")).map((p) => (
                              <div className="professional-slots" key={p.id}>
                                <h3>
                                  <span
                                    className={`pro-dot ${data.profissionais.find((x) => x.id === p.id)?.papel}`}
                                  />
                                  {p.nome}
                                  <small>{p.horarios.length} opções</small>
                                </h3>
                                {p.horarios.length ? (
                                  <div className="slots">
                                    {p.horarios.map((t) => (
                                      <button
                                        key={t}
                                        aria-label={`Agendar ${p.nome} ${a.data} ${t}`}
                                        onClick={() =>
                                          setBooking({
                                            data: a.data,
                                            horario: t,
                                            profissionalId: p.id,
                                            servicoId: service || undefined,
                                          })
                                        }
                                      >
                                        {t}
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="hint">
                                    Sem horários disponíveis.
                                  </p>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </article>
                    ))}
                </div>
              )}
              <p className="info-line">
                Toque em um horário para abrir o agendamento rápido.
              </p>
            </>
          )}
          {page === "agenda" && (
            <>
              <div className="agenda-view-switch" role="group" aria-label="Modo da agenda">
                <button
                  type="button"
                  className={agendaMode === "list" ? "active" : ""}
                  aria-pressed={agendaMode === "list"}
                  onClick={() => setAgendaMode("list")}
                >
                  <CalendarDays size={16} /> Próximos agendamentos
                </button>
                <button
                  type="button"
                  className={agendaMode === "day" ? "active" : ""}
                  aria-pressed={agendaMode === "day"}
                  onClick={() => setAgendaMode("day")}
                >
                  <Users size={16} /> Por profissional
                </button>
              </div>
              {agendaMode === "list" ? (
                <section className="bf-agenda-timeline" aria-label="Lista de atendimentos">
                  <div className="bf-agenda-period-toolbar">
                    <div className="bf-agenda-period-tabs" role="group" aria-label="Período de agendamentos">
                      {([1, 7, 30] as const).map((period) => (
                        <button
                          type="button"
                          key={period}
                          className={agendaPeriod === period ? "active" : ""}
                          aria-pressed={agendaPeriod === period}
                          onClick={() => setAgendaPeriod(period)}
                        >
                          {period === 1 ? "Hoje" : `${period} dias`}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="bf-agenda-refresh"
                      onClick={refresh}
                      aria-label="Atualizar agendamentos"
                      title="Atualizar agendamentos"
                    >
                      <RefreshCw size={19} />
                    </button>
                  </div>
                  {agendaPeriod === 7 && (
                    <nav className="bf-agenda-week" aria-label="Navegar pelos dias da semana">
                      {agendaWeek.map((date) => {
                        const hasBookings = agendaDates.includes(date);
                        const content = (
                          <>
                            <span>{shortAgendaDay(date)}</span>
                            <strong>{Number(date.slice(8, 10))}</strong>
                          </>
                        );
                        return hasBookings ? (
                          <a
                            key={date}
                            href={`#bf-agenda-dia-${date}`}
                            className={`bf-agenda-week-day${date === today() ? " today" : ""}`}
                            aria-label={`Ir para ${dayLabel(date)}`}
                          >
                            {content}
                          </a>
                        ) : (
                          <span
                            key={date}
                            className={`bf-agenda-week-day empty${date === today() ? " today" : ""}`}
                            aria-label={`${dayLabel(date)}: sem agendamentos nos filtros`}
                          >
                            {content}
                          </span>
                        );
                      })}
                    </nav>
                  )}
                  <div className="bf-agenda-filters">
                    <label className="bf-agenda-professional-select">
                      <span className="bf-agenda-sr-only">Profissional</span>
                      <Users size={19} aria-hidden="true" />
                      <select value={pro} onChange={(e) => setPro(Number(e.target.value))} aria-label="Filtrar profissional">
                        <option value={0}>Todos os profissionais</option>
                        {data.profissionais.filter((p) => p.ativo && p.papel === "dono").map((p) => (
                          <option key={p.id} value={p.id}>{p.nome}</option>
                        ))}
                      </select>
                    </label>
                    <details className="bf-agenda-status-filter">
                      <summary>Filtrar situação</summary>
                      <label>
                        Situação do atendimento
                        <select value={agendaStatus} onChange={(e) => setAgendaStatus(e.target.value)}>
                          <option value="ativos">Não cancelados</option>
                          <option value="todos">Todos, incluindo cancelados</option>
                          <option value="Agendado">Agendados</option>
                          <option value="Confirmado">Confirmados</option>
                          <option value="Concluído">Concluídos</option>
                          <option value="Cancelado">Cancelados</option>
                        </select>
                      </label>
                    </details>
                  </div>
                  <p className="bf-agenda-count" aria-live="polite">
                    <strong>{agendaItems.length} atendimento{agendaItems.length === 1 ? "" : "s"}</strong>{" "}
                    {agendaPeriod === 1 ? "hoje" : `nos próximos ${agendaPeriod} dias`}
                  </p>
                  {periodLoading && !periodAppointments.length ? (
                    <Empty>Carregando próximos agendamentos…</Empty>
                  ) : !agendaDates.length ? (
                    <Empty>Nenhum agendamento encontrado para este período e filtros.</Empty>
                  ) : (
                    <div className="bf-agenda-days">
                      {agendaDates.map((date) => (
                        <section key={date} id={`bf-agenda-dia-${date}`} className="bf-agenda-date-group">
                          <div className="bf-agenda-date-title">
                            <h2>{dayLabel(date)}</h2>
                            <span>{agendaItems.filter((a) => bookingDay(a.inicio) === date).length} atendimento{agendaItems.filter((a) => bookingDay(a.inicio) === date).length === 1 ? "" : "s"}</span>
                          </div>
                          <div className="bf-agenda-date-list">
                            {agendaItems
                              .filter((a) => bookingDay(a.inicio) === date)
                              .map((a) => {
                                const duration = Math.round((new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 60000);
                                return (
                                  <div key={a.id} className="bf-agenda-event">
                                    <div className="bf-agenda-event-clock">
                                      <time dateTime={a.inicio}>{localTime(a.inicio)}</time>
                                      <i aria-hidden="true" />
                                    </div>
                                    <button type="button" className="bf-agenda-event-card" onClick={() => setDetail(a)}>
                                      <span className="bf-agenda-event-header">
                                        <strong>{a.cliente}</strong>
                                        <Badge status={a.status} />
                                      </span>
                                      <span className="bf-agenda-event-service">
                                        {a.servico}{duration > 0 ? ` · ${duration} min` : ""}
                                      </span>
                                      <span className="bf-agenda-event-bottom">
                                        <span><Users size={15} aria-hidden="true" /> {data.profissionais.find((p) => p.id === a.profissional_id)?.nome ?? "Profissional"}</span>
                                        <strong>{money(a.preco_centavos)}</strong>
                                      </span>
                                    </button>
                                  </div>
                                );
                              })}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </section>
              ) : (
                <>
              <div className="agenda-toolbar">
                <div className="date-nav">
                  <button
                    className="icon-button"
                    aria-label="Dia anterior"
                    onClick={() => setDay(addDays(day, -1))}
                  >
                    <ChevronLeft />
                  </button>
                  <input
                    aria-label="Dia da agenda"
                    type="date"
                    value={day}
                    onChange={(e) => {
                      if (e.target.value) setDay(e.target.value);
                    }}
                  />
                  <button
                    className="icon-button"
                    aria-label="Próximo dia"
                    onClick={() => setDay(addDays(day, 1))}
                  >
                    <ChevronRight />
                  </button>
                </div>
                <div className="two-fields">
                  <button onClick={() => setDay(data.hoje)}>Hoje</button>
                  <button onClick={() => go("available")}>
                    Horários da semana
                  </button>
                </div>
              </div>
              {filters}
              <h2 className="agenda-day-title">{dayLabel(day)}</h2>
              {dayLoading ? (
                <Empty>Carregando agenda…</Empty>
              ) : (
                <div
                  className={`agenda-columns ${visiblePros.length === 1 ? "single" : ""}`}
                >
                  {visiblePros.map((p) => (
                    <section
                      key={p.id}
                      className={`agenda-professional ${p.papel}`}
                    >
                      <header>
                        <span className="avatar">
                          {p.papel === "dono" ? <Crown /> : <UserRound />}
                        </span>
                        <div>
                          <h2>{p.nome}</h2>
                          <small>
                            Todos os clientes
                          </small>
                        </div>
                      </header>
                      <div className="appointments">
                        {appointments
                          .filter((a) => a.profissional_id === p.id)
                          .map(appointmentCard)}
                        {!appointments.some(
                          (a) => a.profissional_id === p.id,
                        ) && (
                          <p className="hint">Nenhum agendamento neste dia.</p>
                        )}
                      </div>
                      <h3 className="available-heading">
                        <Clock size={17} /> Horários livres
                      </h3>
                      <div className="slots">
                        {daySlots[0]?.profissionais
                          .find((x) => x.id === p.id)
                          ?.horarios.map((t) => (
                            <button
                              key={t}
                              onClick={() =>
                                setBooking({
                                  data: day,
                                  horario: t,
                                  profissionalId: p.id,
                                  servicoId: service || undefined,
                                })
                              }
                            >
                              {t}
                            </button>
                          ))}
                      </div>
                      {!daySlots[0]?.profissionais.find((x) => x.id === p.id)
                        ?.horarios.length && (
                        <p className="hint">
                          Sem horários livres ou dia não liberado.
                        </p>
                      )}
                    </section>
                  ))}
                </div>
              )}
                </>
              )}
            </>
          )}
          {page === "clients" && (
            <section className="bf-clients-premium" aria-label="Gestão de clientes">
              <div className="bf-clients-search">
                <Search size={22} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Buscar nome ou WhatsApp"
                  aria-label="Buscar clientes"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <div className="bf-clients-stats">
                <div className="bf-client-stat">
                  <strong>{clients.length}</strong>
                  <span>{query ? "Resultados da busca" : clients.length >= 200 ? "Clientes exibidos" : "Clientes cadastrados"}</span>
                </div>
                <div className="bf-client-stat">
                  <strong>{clients.filter((c) => c.fixo).length}</strong>
                  <span>Recorrentes</span>
                </div>
                <div className="bf-client-stat">
                  <strong>{clients.filter((c) => !c.fixo).length}</strong>
                  <span>Novos</span>
                </div>
              </div>

              <div className="bf-client-filters" role="group" aria-label="Filtrar clientes">
                {([
                  ["all", "Todos"],
                  ["recurring", "Recorrentes"],
                  ["new", "Novos"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={clientFilter === value ? "active" : ""}
                    aria-pressed={clientFilter === value}
                    onClick={() => setClientFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="bf-client-list-header">
                <h2>Seus clientes</h2>
                <button
                  type="button"
                  className="bf-client-sort"
                  aria-label={clientSortAsc ? "Ordenação A a Z; inverter" : "Ordenação Z a A; inverter"}
                  onClick={() => setClientSortAsc((v) => !v)}
                >
                  {clientSortAsc ? "A–Z" : "Z–A"} <span aria-hidden="true">⇅</span>
                </button>
              </div>

              <div className="bf-client-list">
                {clients
                  .filter((c) =>
                    clientFilter === "all" ||
                    (clientFilter === "recurring" ? c.fixo : !c.fixo)
                  )
                  .sort((a, b) =>
                    clientSortAsc
                      ? a.nome.localeCompare(b.nome, "pt-BR")
                      : b.nome.localeCompare(a.nome, "pt-BR")
                  )
                  .map((c) => (
                    <button
                      type="button"
                      className="bf-client-row"
                      key={c.id}
                      onClick={() => setClientEdit(c)}
                    >
                      <span className={`bf-client-avatar ${c.fixo ? "recurring" : ""}`}>
                        {c.nome.trim().split(/\s+/).map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                      </span>
                      <span className="bf-client-info">
                        <strong>{c.nome}</strong>
                        <small>{c.whatsapp}</small>
                        <small className="bf-client-history">
                          {(c.total ?? 0) > 0
                            ? `${c.total} ${c.total === 1 ? "atendimento" : "atendimentos"}`
                            : "Primeira visita"}
                        </small>
                      </span>
                      <span className={`bf-client-status ${c.fixo ? "recurring" : "new"}`}>
                        {c.fixo ? "Recorrente" : "Novo"}
                      </span>
                      <ChevronRight className="bf-client-chevron" size={20} aria-hidden="true" />
                    </button>
                  ))}
              </div>

              {!clients.length && (
                <Empty>
                  <Users size={30} />
                  <h3>{query ? "Nenhum cliente encontrado." : "Seu relacionamento começa aqui."}</h3>
                  <p>Cadastre o primeiro cliente para começar a agendar.</p>
                  <button className="primary" onClick={() => setClientEdit("new")}>
                    <Plus size={18} /> Novo cliente
                  </button>
                </Empty>
              )}

              {clients.length > 0 &&
                !clients.some((c) =>
                  clientFilter === "all" ||
                  (clientFilter === "recurring" ? c.fixo : !c.fixo)
                ) && (
                  <p className="bf-clients-empty" role="status">
                    Nenhum cliente nesta categoria.
                  </p>
                )}

              <p className="bf-clients-limit">
                Indicadores da listagem atual, limitada a 200 resultados.
              </p>
            </section>
          )}
          {page === "services" && (() => {
            const active = data.servicos.filter((item) => item.ativo);
            const durations = active.map((item) => item.duracao);
            const minimum = durations.length ? Math.min(...durations) : null;
            const maximum = durations.length ? Math.max(...durations) : null;
            const lowest = active.length
              ? Math.min(...active.map((item) => item.precoCentavos))
              : null;

            const items = sortServicesAZ
              ? [...data.servicos].sort((a, b) =>
                  a.nome.localeCompare(b.nome, "pt-BR")
                )
              : data.servicos;

            return (
              <section className="bf-services-premium">
                <div className="bf-svc-hero">
                  <div className="bf-svc-hero-icon">
                    <Scissors size={35} />
                  </div>
                  <div>
                    <span className="bf-svc-kicker">CATÁLOGO DE SERVIÇOS</span>
                    <h2>Seus serviços,<br />sempre organizados.</h2>
                    <p>Serviços ativos, preços e duração.</p>
                  </div>
                </div>

                <div className="bf-svc-metrics">
                  <article>
                    <strong>{active.length}</strong>
                    <span>Ativos</span>
                  </article>
                  <article>
                    <strong>
                      {minimum === null
                        ? "—"
                        : minimum === maximum
                          ? minimum
                          : `${minimum}–${maximum}`}
                    </strong>
                    <span>Minutos</span>
                  </article>
                  <article>
                    <strong>{lowest === null ? "—" : money(lowest).replace(/,00$/, "")}</strong>
                    <span>A partir de</span>
                  </article>
                </div>

                <div className="bf-svc-list-header">
                  <h2>Serviços disponíveis</h2>
                  <button
                    type="button"
                    aria-pressed={sortServicesAZ}
                    onClick={() => setSortServicesAZ((v) => !v)}
                  >
                    {sortServicesAZ ? "Ordem original" : "Ordenar A–Z"} ↕
                  </button>
                </div>

                <div className="bf-svc-list">
                  {items.map((item) => (
                    <button
                      type="button"
                      className="bf-svc-item"
                      key={item.id}
                      onClick={() => setServiceEdit(item)}
                    >
                      <span className="bf-svc-icon">
                        {/barba/i.test(item.nome) &&
                        /cabelo|corte/i.test(item.nome)
                          ? <Crown size={30} />
                          : /barba/i.test(item.nome)
                            ? <Users size={30} />
                            : <Scissors size={30} />}
                      </span>

                      <span className="bf-svc-details">
                        <strong>{item.nome}</strong>
                        <small>
                          {item.duracao} minutos ·{" "}
                          {item.ativo ? "Ativo" : "Inativo"}
                        </small>
                        <b>{money(item.precoCentavos)}</b>
                      </span>

                      <ChevronRight
                        size={22}
                        className="bf-svc-arrow"
                      />
                    </button>
                  ))}
                </div>

                {!data.servicos.length && (
                  <Empty>
                    <Scissors size={30} />
                    <h3>Nenhum serviço cadastrado.</h3>
                    <button
                      className="primary"
                      onClick={() => setServiceEdit("new")}
                    >
                      <Plus size={18} /> Novo serviço
                    </button>
                  </Empty>
                )}

                <p className="bf-svc-notice">
                  <span aria-hidden="true">ⓘ</span>
                  Alterações nos serviços afetam novos agendamentos.
                </p>
              </section>
            );
          })()}
          {page === "settings" && (
            <Settings data={data} onSaved={() => saved()} />
          )}
          <footer className="main-footer">
            Sistema de Agendamento para Barbearias <span>Feito para simplificar seu dia.</span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Menu principal">
        {navigation.map((n) => (
          <button
            key={n.id}
            className={
              page === n.id || (n.id === "agenda" && page === "available")
                ? "active"
                : ""
            }
            onClick={() => go(n.id)}
          >
            <n.icon size={21} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      {booking && (
        <Booking
          data={data}
          preset={booking}
          newClient={newBookingClient}
          onClose={() => {
            setBooking(null);
            setNewBookingClient(null);
          }}
          onSaved={() => {
            setBooking(null);
            setNewBookingClient(null);
            saved("Agendamento salvo. Agenda atualizada.");
          }}
          onNewClient={() => setClientEdit("new")}
        />
      )}
      {clientEdit && (
        <ClientEditor
          client={clientEdit === "new" ? undefined : clientEdit}
          data={data}
          onDeleted={() => {
            setClientEdit(null);
            setNewBookingClient(null);
            saved("Cliente excluído.");
          }}
          onClose={() => setClientEdit(null)}
          onSaved={(client) => {
            setClientEdit(null);
            if (booking) setNewBookingClient(client);
            saved("Cliente salvo.");
          }}
        />
      )}
      {serviceEdit && (
        <ServiceEditor
          service={serviceEdit === "new" ? undefined : serviceEdit}
          onClose={() => setServiceEdit(null)}
          onSaved={() => {
            setServiceEdit(null);
            saved("Serviço atualizado.");
          }}
        />
      )}
      {detail && (
        <AppointmentDetail
          appointment={detail}
          data={data}
          onClose={() => setDetail(null)}
          onSaved={() => {
            setDetail(null);
            saved("Atendimento atualizado.");
          }}
          onReschedule={() => {
            setBooking({ appointment: detail });
            setDetail(null);
          }}
        />
      )}
    </div>
  );
}
