export const ZONE = "America/Sao_Paulo";
const offsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  timeZoneName: "longOffset",
});
export function today(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekday(day: string) {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}
export function monday(day: string) {
  return addDays(day, -((weekday(day) + 6) % 7));
}
export function minutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function clock(n: number) {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
export function instant(day: string, time: string) {
  let result = new Date(`${day}T${time}:00Z`);
  for (let i = 0; i < 2; i++) {
    const zone = offsetFormatter
      .formatToParts(result)
      .find((p) => p.type === "timeZoneName")!.value;
    const offset = zone === "GMT" ? "Z" : zone.replace("GMT", "");
    result = new Date(`${day}T${time}:00${offset}`);
  }
  return result;
}
export function localTime(value: string | Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export function dayLabel(day: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${day}T12:00:00Z`));
}
// A loja recebe agendamentos online a qualquer hora da semana.
// Atendimento: terça a sábado; a lista de meses vai até dezembro do ano seguinte.
// Antigas linhas de agenda_liberacoes são ignoradas para não exigir abertura semanal.
export function released(
  day: string,
  now: Date,
  _periods: { inicio: string; fim: string }[] = [],
) {
  const current = today(now);
  const last = `${Number(current.slice(0, 4)) + 1}-12-31`;
  const dayOfWeek = weekday(day);
  return day >= current && day <= last && dayOfWeek >= 2 && dayOfWeek <= 6;
}
export type Interval = { inicio: number; fim: number };

// Limites de atendimento da configuracao demonstrativa.
export function withinOperatingHours(windows: Interval[]): Interval[] {
  const allowed: Interval[] = [
    { inicio: 540, fim: 720 },
    // Intervalo extra liberável pelo dono, sem atravessar o almoço.
    { inicio: 720, fim: 750 },
    { inicio: 840, fim: 1170 },
  ];

  return windows.flatMap((window) =>
    allowed
      .map((period) => ({
        inicio: Math.max(window.inicio, period.inicio),
        fim: Math.min(window.fim, period.fim),
      }))
      .filter((interval) => interval.inicio < interval.fim),
  );
}
function freeIntervals(windows: Interval[], busy: Interval[]): Interval[] {
  const ordered = [...busy].sort((a, b) => a.inicio - b.inicio);
  const free: Interval[] = [];
  for (const window of windows) {
    let start = window.inicio;
    for (const block of ordered) {
      if (block.fim <= start || block.fim <= block.inicio) continue;
      if (block.inicio >= window.fim) break;
      if (block.inicio > start) free.push({ inicio: start, fim: block.inicio });
      start = block.fim;
      if (start >= window.fim) break;
    }
    if (start < window.fim) free.push({ inicio: start, fim: window.fim });
  }
  return free;
}

export function freeSlots({
  day,
  duration,
  windows,
  busy,
  now = new Date(),
  isReleased,
  publicGrid = false,
  publicMorningGrace = false,
  gridStep,
}: {
  day: string;
  duration: number;
  windows: Interval[];
  busy: Interval[];
  now?: Date;
  isReleased: boolean;
  publicGrid?: boolean;
  publicMorningGrace?: boolean;
  gridStep?: 15 | 30;
}) {
  if (!isReleased) return [];
  const slots = new Set<string>();
  const merged: Interval[] = [];
  for (const w of [...windows].sort((a, b) => a.inicio - b.inicio)) {
    const last = merged.at(-1);
    const noonBoundary = last?.fim === 720 && w.inicio === 720;
    if (last && w.inicio <= last.fim && !noonBoundary)
      last.fim = Math.max(last.fim, w.fim);
    else merged.push({ ...w });
  }
  // BLACK_PUBLIC_GRID_30: cada trecho livre tem sua própria origem.
  // BLACK_MORNING_GRACE_15: tolerância no término do turno regular das 12h30.
  if (publicGrid) {
    const publicWindows = [...merged];
    const configuredMorningEnd = 12 * 60 + 30;
    const noon = 12 * 60;
    let morningIndex = publicMorningGrace
      ? publicWindows.findIndex((window) => window.inicio < noon
          && (window.fim === noon || window.fim === configuredMorningEnd))
      : -1;
    if (morningIndex >= 0 && publicWindows[morningIndex].fim === noon) {
      const next = publicWindows[morningIndex + 1];
      if (next?.inicio === noon && next.fim === configuredMorningEnd) {
        publicWindows.splice(morningIndex, 2, {
          inicio: publicWindows[morningIndex].inicio,
          fim: configuredMorningEnd,
        });
      } else {
        morningIndex = -1;
      }
    }
    for (const [index, window] of publicWindows.entries()) {
      const nextStart = publicWindows[index + 1]?.inicio ?? Number.POSITIVE_INFINITY;
      const end = index === morningIndex ? Math.min(window.fim + 15, nextStart) : window.fim;
      for (const interval of freeIntervals([{ inicio: window.inicio, fim: end }], busy)) {
        for (let start = interval.inicio; start < window.fim && start + duration <= interval.fim; start += 30) {
          const time = clock(start);
          if (instant(day, time) > now) slots.add(time);
        }
      }
    }
    return [...slots].sort();
  }
  for (const w of merged) {
    const step = gridStep ?? (duration === 30 && w.inicio < 840 ? 30 : 15);
    const starts = new Set<number>();
    for (
      let t = Math.ceil(w.inicio / step) * step;
      t + duration <= w.fim;
      t += step
    ) starts.add(t);
    // AGENDA ENCAIXE 45: mantém a grade da manhã e libera o término
    // de uma reserva/bloqueio, como 09:45 após um atendimento de 45 min.
    if (step === 30) {
      for (const b of busy) {
        if (
          Number.isInteger(b.fim) && b.fim % 15 === 0 &&
          b.fim >= w.inicio && b.fim + duration <= w.fim
        ) starts.add(b.fim);
      }
    }
    for (const t of starts) {
      if (instant(day, clock(t)) <= now) continue;
      if (!busy.some((b) => t < b.fim && t + duration > b.inicio))
        slots.add(clock(t));
    }
  }
  return [...slots].sort();
}


// Sugestão informativa: não elimina vagas e nunca substitui a verificação no servidor.
// AGENDA AGENDA INTELIGENTE V2
// Apenas recomenda: nunca remove horarios nem altera as validacoes de reserva.
// Mede minutos que nao poderiam ser preenchidos pelos servicos ativos.
export function bestFitSlots({
  horarios,
  duration,
  windows,
  busy,
  serviceDurations = [],
}: {
  horarios: string[];
  duration: number;
  windows: Interval[];
  busy: Interval[];
  serviceDurations?: number[];
}): string[] {
  if (!horarios.length || !Number.isInteger(duration) || duration <= 0) return [];

  const durations = [...new Set([duration, ...serviceDurations].filter(
    (value) => Number.isInteger(value) && value > 0 && value <= 1440,
  ))];

  const merged: Interval[] = [];
  for (const window of [...windows].sort((a, b) => a.inicio - b.inicio)) {
    if (window.fim <= window.inicio) continue;
    const last = merged.at(-1);
    if (last && window.inicio <= last.fim) last.fim = Math.max(last.fim, window.fim);
    else merged.push({ ...window });
  }
  if (!merged.length) return [];

  // Precalcula, por tamanho de intervalo, quanto tempo sobraria sem caber
  // uma combinacao de servicos cadastrados. Complexidade pequena por chamada.
  const maxGap = Math.max(...merged.map((window) => window.fim - window.inicio));
  const canFill = new Uint8Array(maxGap + 1);
  const wastedMinutes = new Uint16Array(maxGap + 1);
  canFill[0] = 1;
  let largestFill = 0;
  for (let gap = 1; gap <= maxGap; gap++) {
    if (durations.some((service) => service <= gap && canFill[gap - service])) {
      canFill[gap] = 1;
      largestFill = gap;
    }
    wastedMinutes[gap] = gap - largestFill;
  }

  const rated = horarios.flatMap((horario) => {
    const start = minutes(horario);
    const end = start + duration;
    const window = merged.find((w) => start >= w.inicio && end <= w.fim);
    if (!window) return [];

    let left = window.inicio;
    let right = window.fim;
    for (const block of busy) {
      if (block.fim <= start && block.fim > left) left = block.fim;
      if (block.inicio >= end && block.inicio < right) right = block.inicio;
    }
    const before = start - left;
    const after = right - end;
    if (before < 0 || after < 0) return [];

    const waste = wastedMinutes[before] + wastedMinutes[after];
    const joinsBooking = Number(busy.some((b) => b.fim === start)) +
      Number(busy.some((b) => b.inicio === end));
    const startsShift = Number(start === window.inicio);
    return [{ horario, waste, joinsBooking, startsShift }];
  });

  const escolhas: string[] = [];
  for (const morning of [true, false]) {
    const period = rated
      .filter((option) => (option.horario < '12:00') === morning)
      .sort((a, b) =>
        a.waste - b.waste ||
        b.joinsBooking - a.joinsBooking ||
        b.startsShift - a.startsShift ||
        a.horario.localeCompare(b.horario),
      );
    if (period.length < 2) continue;
    const best = period[0];
    const hasAdvantage = period.some((other) =>
      other.waste > best.waste ||
      (other.waste === best.waste && other.joinsBooking < best.joinsBooking) ||
      (other.waste === best.waste &&
        other.joinsBooking === best.joinsBooking &&
        other.startsShift < best.startsShift),
    );
    if (hasAdvantage) escolhas.push(best.horario);
  }
  return escolhas;
}

// AGENDA AGENDA SEMANAL PUBLICA V3
// Apenas o cliente do /agendar tem janela de reserva semanal.
// A gestao administrativa e a disponibilidade geral permanecem independentes.
export function publicWeekEnd(now = new Date()): string {
  const current = today(now);
  const endOfWeek = addDays(monday(current), 5);

  // Quando a semana terminou, disponibiliza a proxima.
  return endOfWeek < current
    ? addDays(endOfWeek, 7)
    : endOfWeek;
}

export function publicWeekReleased(day: string, now = new Date()): boolean {
  const current = today(now);
  const dayOfWeek = weekday(day);
  return day >= current && day <= publicWeekEnd(now) && dayOfWeek >= 2 && dayOfWeek <= 6;
}
