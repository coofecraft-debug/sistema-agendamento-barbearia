import { minutes, type Interval } from "./time";

// BLACK_MAXIMO_APROVEITAMENTO_V1
// Keep the starts that leave the least unusable time in each real free gap.
// A remaining 30+45 minutes is usable, even when it is not a multiple of one service.
export function maximizeSlotUse({
  horarios, duration, windows, busy, serviceDurations, notBefore = 0,
}: {
  horarios: string[];
  duration: number;
  windows: Interval[];
  busy: Interval[];
  serviceDurations: number[];
  notBefore?: number;
}): string[] {
  if (!horarios.length || !Number.isInteger(duration) || duration <= 0 || duration > 1440) return [];
  const durations = [...new Set([duration, ...serviceDurations].filter(
    (value) => Number.isInteger(value) && value > 0 && value <= 1440,
  ))];
  const shifts: Interval[] = [];
  for (const window of [...windows].sort((a, b) => a.inicio - b.inicio)) {
    if (window.inicio >= window.fim) continue;
    const last = shifts.at(-1);
    // Match freeSlots: the extra 12:00-12:30 period is a separate window.
    const noonBoundary = last?.fim === 720 && window.inicio === 720;
    if (last && window.inicio <= last.fim && !noonBoundary)
      last.fim = Math.max(last.fim, window.fim);
    else shifts.push({ ...window });
  }
  const gaps: Interval[] = [];
  for (const shift of shifts) {
    let cursor = Math.max(shift.inicio, notBefore);
    for (const block of [...busy].sort((a, b) => a.inicio - b.inicio)) {
      if (block.fim <= cursor || block.inicio >= shift.fim || block.inicio >= block.fim) continue;
      if (block.inicio > cursor) gaps.push({ inicio: cursor, fim: block.inicio });
      cursor = Math.max(cursor, block.fim);
      if (cursor >= shift.fim) break;
    }
    if (cursor < shift.fim) gaps.push({ inicio: cursor, fim: shift.fim });
  }
  if (!gaps.length) return [];
  const maxGap = Math.max(...gaps.map((gap) => gap.fim - gap.inicio));
  const canFill = new Uint8Array(maxGap + 1);
  const wasted = new Uint16Array(maxGap + 1);
  canFill[0] = 1;
  let largestFill = 0;
  for (let length = 1; length <= maxGap; length++) {
    if (durations.some((service) => service <= length && canFill[length - service])) {
      canFill[length] = 1;
      largestFill = length;
    }
    wasted[length] = length - largestFill;
  }
  const selected = new Set<string>();
  for (const gap of gaps) {
    const options = horarios.flatMap((horario) => {
      const start = minutes(horario);
      if (!Number.isInteger(start) || start < gap.inicio || start + duration > gap.fim) return [];
      const loss = wasted[start - gap.inicio] + wasted[gap.fim - start - duration];
      return [{ horario, loss }];
    });
    if (!options.length) continue;
    const best = Math.min(...options.map((option) => option.loss));
    // If a loss is unavoidable, retain the best available start in this gap.
    for (const option of options) if (option.loss === best) selected.add(option.horario);
  }
  return [...selected].sort();
}
