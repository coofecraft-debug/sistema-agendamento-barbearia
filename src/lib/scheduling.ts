import { sql } from "@/db";
import {
  addDays,
  clock,
  freeSlots,
  bestFitSlots,
  withinOperatingHours,
  instant,
  localTime,
  minutes,
  monday,
  released,
  today,
  weekday,
} from "./time";
import type { DayAvailability } from "./types";
type Connection = Pick<typeof sql, "unsafe">;
// Compatibilidade com chamadas existentes: datas futuras não dependem mais
// de liberação semanal gravada no banco.
export async function syncRelease() {
  return;
}
export async function availability(
  connection: Connection,
  from: string,
  days: number,
  duration: number,
  professional?: number,
  exclude?: string,
  now = new Date(),
  publicGrid = false,
): Promise<DayAvailability[]> {
  const until = addDays(from, days);
  const [professionals, hours, extras, blocks, bookings, periods, activeServices] =
    await Promise.all([
      connection.unsafe(
        "SELECT * FROM profissionais WHERE ativo=true AND ($1::int IS NULL OR id=$1)",
        [professional ?? null],
      ),
      connection.unsafe("SELECT * FROM expediente"),
      connection.unsafe(
        "SELECT *, data::text AS data FROM horarios_extras WHERE data >= $1::date AND data < $2::date",
        [from, until],
      ),
      connection.unsafe(
        "SELECT * FROM bloqueios WHERE inicio < $2::timestamptz AND fim > $1::timestamptz",
        [
          instant(from, "00:00").toISOString(),
          instant(until, "00:00").toISOString(),
        ],
      ),
      connection.unsafe(
        "SELECT * FROM agendamentos WHERE status <> 'Cancelado' AND inicio < $2::timestamptz AND fim > $1::timestamptz AND ($3::uuid IS NULL OR id <> $3::uuid)",
        [
          instant(from, "00:00").toISOString(),
          instant(until, "00:00").toISOString(),
          exclude ?? null,
        ],
      ),
      connection.unsafe(
        "SELECT inicio::text, fim::text FROM agenda_liberacoes",
      ),
      connection.unsafe("SELECT DISTINCT duracao FROM servicos WHERE ativo=true AND duracao > 0"),
    ]);
  const serviceDurations = activeServices.map((row) => Number(row.duracao));
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(from, i),
      open = released(
        day,
        now,
        periods as unknown as { inicio: string; fim: string }[],
      );
    return {
      data: day,
      liberado: open,
      profissionais: professionals.map((p) => {
        const weeklyHours = hours.filter(
          (h) => h.profissional_id === p.id && h.dia_semana === weekday(day),
        );
        const regular = weeklyHours.map((h) => ({
          inicio: minutes(h.inicio),
          fim: minutes(h.fim),
        }));
        const publicMorningGrace = publicGrid && (
          regular.some((w) => w.inicio < 720 && w.fim === 750) ||
          (regular.some((w) => w.inicio < 720 && w.fim === 720) &&
            regular.some((w) => w.inicio === 720 && w.fim === 750))
        );
        const windows = withinOperatingHours(
          [
            ...weeklyHours,
            ...extras.filter((e) => e.profissional_id === p.id && e.data === day),
          ].map((w) => ({
            inicio: minutes(w.inicio),
            fim: minutes(w.fim),
          })),
        );
        const busy = [...blocks, ...bookings]
          .filter(
            (b) =>
              b.profissional_id === p.id &&
              new Date(b.inicio) < instant(addDays(day, 1), "00:00") &&
              new Date(b.fim) > instant(day, "00:00"),
          )
          .map((b) => ({
            inicio:
              today(new Date(b.inicio)) < day
                ? 0
                : minutes(localTime(b.inicio)),
            fim:
              today(new Date(b.fim)) > day ? 1440 : minutes(localTime(b.fim)),
          }));
        const horarios = freeSlots({
          day,
          duration,
          windows,
          busy,
          now,
          isReleased: open,
          publicGrid,
          publicMorningGrace,
        });
        return {
          id: p.id as number,
          nome: p.nome as string,
          horarios,
          melhoresEncaixes: bestFitSlots({ horarios, duration, windows, busy, serviceDurations }),
        };
      }),
    };
  });
}
// A prévia e a confirmação públicas consultam a mesma grade.
export function publicAvailability(
  connection: Connection, from: string, days: number, duration: number,
  professional?: number, exclude?: string, now = new Date(),
): Promise<DayAvailability[]> {
  return availability(connection, from, days, duration, professional, exclude, now, true);
}
export { clock };
