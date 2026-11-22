// BLACK_WEEKLY_PANEL_V1: destinatarios escolhidos no painel administrativo.
import type { sql } from "@/db";
import { addDays, instant, today, weekday } from "./time";

type Connection = Pick<typeof sql, "unsafe">;

/** Monday 09:00–20:00 in São Paulo. No late invitation is sent on Tuesday. */
export function invitationWindow(now = new Date(), hour = 9) {
  if (!Number.isInteger(hour) || hour < 8 || hour > 18) throw new Error("WHATSAPP_INVITE_HOUR_INVALID");
  const day = today(now);
  const start = instant(day, String(hour).padStart(2, "0") + ":00");
  const end = instant(day, "20:00");
  return weekday(day) === 1 && now >= start && now < end
    ? { week: day, start, end, until: instant(addDays(day, 7), "00:00") }
    : null;
}

export async function scheduleWeeklyInvitations(
  tx: Connection, allowed: string[] | null, now = new Date(), hour = 9,
) {
  const window = invitationWindow(now, hour);
  if (!window || (allowed !== null && !allowed.length)) return 0;
  const rows = await tx.unsafe(`INSERT INTO comunicacao_convites
      (cliente_id,whatsapp,semana,versao,executar_em,expira_em)
    SELECT c.id,p.whatsapp,$1::date,p.versao,$2::timestamptz,$3::timestamptz
    FROM clientes c JOIN comunicacao_preferencias p ON p.cliente_id=c.id
    JOIN comunicacao_convites_destinatarios d ON d.cliente_id=c.id
      AND d.ativo=true AND d.whatsapp=p.whatsapp
    WHERE p.convites=true AND p.bloqueado=false
      AND p.whatsapp=black_whatsapp(c.whatsapp)
      AND ($4::text[] IS NULL OR p.whatsapp=ANY($4::text[]))
      AND NOT EXISTS (SELECT 1 FROM agendamentos a WHERE a.cliente_id=c.id
        AND a.status IN ('Agendado','Confirmado') AND a.inicio>=$2::timestamptz AND a.inicio<$5::timestamptz)
    ORDER BY c.id ON CONFLICT(whatsapp,semana) DO NOTHING RETURNING id`,
    [window.week, window.start.toISOString(), window.end.toISOString(), allowed, window.until.toISOString()]);
  return rows.length;
}
