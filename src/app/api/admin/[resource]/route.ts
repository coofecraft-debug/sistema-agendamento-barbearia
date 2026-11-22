import { NextResponse } from "next/server";
import { z } from "zod";
import { db, sql } from "@/db";
import { servicos, profissionais } from "@/db/schema";
import { session, checkOrigin } from "@/lib/auth";
import { publicAvailability, availability, syncRelease } from "@/lib/scheduling";
import { scheduleMessages, cancelQueued } from "@/lib/comunicacao";
import { saveCommunicationPreferences, saveBookingConsent } from "@/lib/communication-preferences";
import { assertWeeklyInvitationNotBlocked, saveWeeklyInvitationAudience } from "@/lib/weekly-audience";
import { addDays, instant, today, weekday } from "@/lib/time";
import {
  bookingSchema,
  clientSchema,
  date,
  hoursSchema,
  id,
  periodSchema,
  serviceSchema,
  statusSchema,
} from "@/lib/validation";
export const runtime = "nodejs";
type Context = { params: Promise<{ resource: string }> };
class Conflict extends Error {}
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
function fail(error: unknown) {
  if (error instanceof z.ZodError)
    return reply(
      { error: error.issues[0]?.message ?? "Dados inválidos." },
      400,
    );
  if (error instanceof Conflict) return reply({ error: error.message }, 409);
  const e = error as { code?: string; message?: string };
  if (e.code === "23P01")
    return reply(
      { error: "Este horário acabou de ser ocupado. Escolha outro." },
      409,
    );
  if (e.code === "23505")
    return reply(
      { error: "Este cadastro já existe. Busque pelo telefone." },
      409,
    );
  if (e.message === "WEEKLY_INVITATION_BLOCKED")
    return reply({ error: "Este telefone tem bloqueio de mensagens. Mantenha o convite semanal desativado e confira a preferência com o cliente." }, 409);
  if (e.message === "WEEKLY_INVITATION_CONSENT_REQUIRED")
    return reply({ error: "Confirme a autorização do cliente para ativar o convite semanal." }, 409);
  if (e.message === "WHATSAPP_INVALID")
    return reply({ error: "Informe um WhatsApp com DDD e nove dígitos para autorizar mensagens." }, 409);
  if (e.message === "ORIGIN")
    return reply({ error: "Origem não autorizada." }, 403);
  console.error("Falha administrativa", e.code ?? "internal");
  return reply({ error: "Não foi possível concluir. Tente novamente." }, 500);
}
export async function GET(request: Request, context: Context) {
  try {
    const user = await session();
    if (!user) return reply({ error: "Entre para continuar." }, 401);
    const { resource } = await context.params;
    const params = new URL(request.url).searchParams;
    if (resource === "bootstrap") {
      await syncRelease();
      const [p, s, c, h, b, e, l] = await Promise.all([
        db.select().from(profissionais),
        db.select().from(servicos),
        sql`SELECT c.*,coalesce((SELECT d.ativo FROM comunicacao_convites_destinatarios d WHERE d.cliente_id=c.id AND d.whatsapp=black_whatsapp(c.whatsapp)),false) AS "conviteSemanalAtivo",coalesce((SELECT p.convites AND NOT p.bloqueado FROM comunicacao_preferencias p WHERE p.cliente_id=c.id AND p.whatsapp=black_whatsapp(c.whatsapp)),false) AS "permiteConvites" FROM clientes c ORDER BY c.nome LIMIT 200`,
        sql`SELECT * FROM expediente ORDER BY dia_semana,inicio`,
        sql`SELECT * FROM bloqueios WHERE fim>=now() ORDER BY inicio LIMIT 300`,
        sql`SELECT id,profissional_id,data::text,inicio,fim FROM horarios_extras WHERE data>=${today()} ORDER BY horarios_extras.data LIMIT 300`,
        sql`SELECT id,inicio::text,fim::text,tipo FROM agenda_liberacoes ORDER BY agenda_liberacoes.inicio DESC`,
      ]);
      return reply({
        profissionais: p,
        servicos: s,
        clientes: c,
        expediente: h,
        bloqueios: b,
        extras: e,
        liberacoes: l,
        hoje: today(),
        nome: user.nome,
      });
    }
    if (resource === "availability") {
      const calculateAvailability = params.get("grid") === "public" ? publicAvailability : availability;
      const from = date.parse(params.get("from"));
      const days = z.coerce
        .number()
        .int()
        .min(1)
        .max(7)
        .parse(params.get("days") ?? 7);
      const service = params.get("service");
      let duration = 30;
      if (service) {
        const [s] =
          await sql`SELECT duracao FROM servicos WHERE id=${id.parse(service)} AND ativo`;
        if (!s) throw new Conflict("Serviço indisponível.");
        duration = s.duracao;
      }
      const professional = params.get("professional")
        ? id.parse(params.get("professional"))
        : undefined;
      const exclude = params.get("exclude")
        ? z.uuid().parse(params.get("exclude"))
        : undefined;
      await syncRelease();
      return reply(
        await calculateAvailability(sql, from, days, duration, professional, exclude),
      );
    }
    if (resource === "appointments") {
      const from = date.parse(params.get("from"));
      const days = z.coerce
        .number()
        .int()
        .min(1)
        .max(31)
        .parse(params.get("days") ?? 1);
      return reply(
        await sql`SELECT a.*,coalesce((SELECT co.autorizado FROM comunicacao_consentimentos co WHERE co.agendamento_id=a.id),false) AS permite_notificacoes,c.nome AS cliente,c.observacoes AS cliente_observacoes,s.nome AS servico FROM agendamentos a JOIN clientes c ON c.id=a.cliente_id JOIN servicos s ON s.id=a.servico_id WHERE a.inicio>=${instant(from, "00:00").toISOString()} AND a.inicio<${instant(addDays(from, days), "00:00").toISOString()} ORDER BY a.inicio`,
      );
    }
    if (resource === "clients") {
      const q = z
        .string()
        .max(100)
        .parse(params.get("q") ?? "");
      return reply(
        await sql`SELECT c.*,coalesce((SELECT d.ativo FROM comunicacao_convites_destinatarios d WHERE d.cliente_id=c.id AND d.whatsapp=black_whatsapp(c.whatsapp)),false) AS "conviteSemanalAtivo",coalesce((SELECT p.convites AND NOT p.bloqueado FROM comunicacao_preferencias p WHERE p.cliente_id=c.id AND p.whatsapp=black_whatsapp(c.whatsapp)),false) AS "permiteConvites", (SELECT count(*)::int FROM agendamentos a WHERE a.cliente_id=c.id AND a.status='Concluído') AS total,(SELECT max(inicio) FROM agendamentos a WHERE a.cliente_id=c.id AND a.status='Concluído') AS ultimo FROM clientes c WHERE c.nome ILIKE ${"%" + q + "%"} OR c.whatsapp LIKE ${"%" + (q.replace(/\D/g, "") || q) + "%"} ORDER BY c.nome LIMIT 200`,
      );
    }
    if (resource === "messages") {
      return reply(await sql`SELECT * FROM (
        SELECT 'reserva' AS canal,f.id,f.tipo,f.status,f.executar_em,f.tentativas,f.ultima_falha,
          f.meta_entrega_status,c.nome AS cliente
        FROM comunicacao_fila f JOIN agendamentos a ON a.id=f.agendamento_id JOIN clientes c ON c.id=a.cliente_id
        UNION ALL
        SELECT 'convite' AS canal,f.id,'convite' AS tipo,f.status,f.executar_em,f.tentativas,f.ultima_falha,
          f.meta_entrega_status,c.nome AS cliente
        FROM comunicacao_convites f JOIN clientes c ON c.id=f.cliente_id
      ) messages ORDER BY executar_em DESC,id DESC LIMIT 60`);
    }
    if (resource === "history") {
      return reply(
        await sql`SELECT a.*,coalesce((SELECT co.autorizado FROM comunicacao_consentimentos co WHERE co.agendamento_id=a.id),false) AS permite_notificacoes,c.nome AS cliente,c.observacoes AS cliente_observacoes,s.nome AS servico FROM agendamentos a JOIN clientes c ON c.id=a.cliente_id JOIN servicos s ON s.id=a.servico_id WHERE a.cliente_id=${id.parse(params.get("client"))} ORDER BY a.inicio DESC LIMIT 100`,
      );
    }
    return reply({ error: "Não encontrado." }, 404);
  } catch (error) {
    return fail(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    if (!(await session()))
      return reply({ error: "Entre para continuar." }, 401);
    checkOrigin(request);
    if (Number(request.headers.get("content-length") ?? 0) > 20000)
      return reply({ error: "Requisição muito grande." }, 413);
    const { resource } = await context.params;
    const body = await request.json();
    const result = await sql.begin(async (tx) => {
      // Single, short scheduling/configuration lock: appropriate for two professionals, prevents config/booking races.
      await tx`SELECT pg_advisory_xact_lock(19442003)`;
      if (resource === "remove-client") {
        const b = z.object({ id }).strict().parse(body);
        const [client] =
          await tx`SELECT id FROM clientes WHERE id=${b.id} FOR UPDATE`;
        if (!client) throw new Conflict("Cliente não encontrado.");
        const [booking] =
          await tx`SELECT id FROM agendamentos WHERE cliente_id=${b.id} LIMIT 1`;
        if (booking)
          throw new Conflict(
            "Este cliente possui agendamentos ou histórico de atendimentos e não pode ser excluído.",
          );
        try {
          await tx`DELETE FROM clientes WHERE id=${b.id}`;
        } catch (error) {
          if ((error as { code?: string }).code === "23503")
            throw new Conflict("Este cliente possui registros vinculados e não pode ser excluído.");
          throw error;
        }
        return { ok: true };
      }
      if (resource === "clients") {
        const c = clientSchema.parse(body);
        const [previous] = c.id ? await tx`SELECT whatsapp FROM clientes WHERE id=${c.id} FOR UPDATE` : [];
        const [row] = c.id
          ? await tx`UPDATE clientes SET nome=${c.nome},whatsapp=${c.whatsapp},fixo=${c.fixo},profissional_preferencial=${c.profissional_preferencial},observacoes=${c.observacoes} WHERE id=${c.id} RETURNING *`
          : await tx`INSERT INTO clientes(nome,whatsapp,fixo,profissional_preferencial,observacoes) VALUES(${c.nome},${c.whatsapp},${c.fixo},${c.profissional_preferencial},${c.observacoes}) RETURNING *`;
        if (!row) throw new Conflict("Cliente não encontrado.");
        const [changed] = previous ? await tx`SELECT black_whatsapp(${previous.whatsapp}) IS DISTINCT FROM black_whatsapp(${row.whatsapp}) AS changed` : [];
        if (changed?.changed) {
          await tx`UPDATE comunicacao_consentimentos co SET autorizado=false FROM agendamentos a
            WHERE a.id=co.agendamento_id AND a.cliente_id=${row.id} AND a.inicio>now()`;
          await tx`UPDATE comunicacao_fila f SET status='cancelado' FROM agendamentos a
            WHERE a.id=f.agendamento_id AND a.cliente_id=${row.id} AND f.status='pendente'`;
        }
        await assertWeeklyInvitationNotBlocked(tx, row.id, row.whatsapp, c.conviteSemanalAtivo);
        if (c.permiteConvites !== undefined || changed?.changed)
          await saveCommunicationPreferences(tx, row.id, row.whatsapp, { convites: c.permiteConvites ?? false }, "admin");
        await saveWeeklyInvitationAudience(tx, row.id, row.whatsapp, c.conviteSemanalAtivo, changed?.changed === true);
        const [audience] = await tx`SELECT ativo FROM comunicacao_convites_destinatarios
          WHERE cliente_id=${row.id} AND whatsapp=black_whatsapp(${row.whatsapp})`;
        const [preferences] = await tx`SELECT convites AND NOT bloqueado AS allowed FROM comunicacao_preferencias
          WHERE cliente_id=${row.id} AND whatsapp=black_whatsapp(${row.whatsapp})`;
        return { ...row, permiteConvites: preferences?.allowed === true, conviteSemanalAtivo: audience?.ativo === true };
      }
      if (resource === "services") {
        const s = serviceSchema.parse(body);
        if (s.id)
          await tx`UPDATE servicos SET nome=${s.nome},preco_centavos=${s.precoCentavos},duracao=${s.duracao},ativo=${s.ativo} WHERE id=${s.id}`;
        else
          await tx`INSERT INTO servicos(nome,preco_centavos,duracao,ativo) VALUES(${s.nome},${s.precoCentavos},${s.duracao},${s.ativo})`;
        return { ok: true };
      }
      if (resource === "booking") {
        const b = bookingSchema.parse(body);
        if (!b.id) {
          const [existing] =
            await tx`SELECT * FROM agendamentos WHERE chave=${b.chave}`;
          if (existing) return existing;
        }
        const [s] =
          await tx`SELECT * FROM servicos WHERE id=${b.servicoId} AND ativo`;
        if (!s) throw new Conflict("Serviço indisponível.");
        let previousClientId: number | undefined;
        if (b.id) {
          const [old] = await tx`SELECT * FROM agendamentos WHERE id=${b.id}`;
          previousClientId = old?.cliente_id;
          if (!old || !["Agendado", "Confirmado"].includes(old.status))
            throw new Conflict(
              "Somente agendamentos ativos podem ser remarcados.",
            );
        }
        const [owner] =
          await tx`SELECT id FROM profissionais WHERE id=${b.profissionalId} AND ativo=true AND papel='dono'`;
        if (!owner)
          throw new Conflict("Agendamentos disponíveis somente com o Dono.");
        const available = await availability(
          tx,
          b.data,
          1,
          s.duracao,
          b.profissionalId,
          b.id,
        );
        const isAvailable = available[0]?.profissionais[0]?.horarios.includes(b.horario);
        if (
          !isAvailable &&
          !(await publicAvailability(
            tx, b.data, 1, s.duracao, b.profissionalId, b.id,
          ))[0]?.profissionais[0]?.horarios.includes(b.horario)
        )
          throw new Conflict(
            "Horário indisponível para esta data ou profissional.",
          );
        const start = instant(b.data, b.horario),
          end = new Date(start.getTime() + s.duracao * 60000);
        if (b.id) {
          const [row] =
            await tx`UPDATE agendamentos SET cliente_id=${b.clienteId},servico_id=${b.servicoId},profissional_id=${b.profissionalId},inicio=${start.toISOString()},fim=${end.toISOString()},preco_centavos=${s.preco_centavos},observacoes=${b.observacoes} WHERE id=${b.id} RETURNING *`;
          await saveBookingConsent(tx, row.id, b.clienteId, b.permiteNotificacoes, previousClientId === b.clienteId);
          await scheduleMessages(tx, row.id);
          return row;
        }
        const [row] =
          await tx`INSERT INTO agendamentos(cliente_id,servico_id,profissional_id,inicio,fim,preco_centavos,observacoes,chave) VALUES(${b.clienteId},${b.servicoId},${b.profissionalId},${start.toISOString()},${end.toISOString()},${s.preco_centavos},${b.observacoes},${b.chave}) RETURNING *`;
        await saveBookingConsent(tx, row.id, b.clienteId, b.permiteNotificacoes, false);
        await scheduleMessages(tx, row.id);
        return row;
      }
      if (resource === "status") {
        const b = statusSchema.parse(body);
        const [old] = await tx`SELECT * FROM agendamentos WHERE id=${b.id}`;
        if (!old || !["Agendado", "Confirmado"].includes(old.status))
          throw new Conflict("Este atendimento já foi encerrado.");
        if (
          ["Concluído", "Faltou"].includes(b.status) &&
          new Date(old.inicio) > new Date()
        )
          throw new Conflict("Aguarde o horário do atendimento.");
        await tx`UPDATE agendamentos SET status=${b.status} WHERE id=${b.id}`;
        if (["Cancelado", "Concluído", "Faltou"].includes(b.status)) await cancelQueued(tx, b.id);
        return { ok: true };
      }
      if (resource === "hours") {
        const h = hoursSchema.parse(body);
        await tx`DELETE FROM expediente WHERE profissional_id=${h.profissionalId} AND dia_semana=${h.diaSemana}`;
        for (const p of h.periodos)
          await tx`INSERT INTO expediente(profissional_id,dia_semana,inicio,fim) VALUES(${h.profissionalId},${h.diaSemana},${p.inicio},${p.fim})`;
        return { ok: true };
      }
      if (resource === "blocks" || resource === "extras") {
        const b = periodSchema.parse(body);
        if (resource === "blocks") {
          const start = instant(b.data, b.diaInteiro ? "00:00" : b.inicio),
            end = b.diaInteiro
              ? instant(addDays(b.data, 1), "00:00")
              : instant(b.data, b.fim);
          const collision =
            await tx`SELECT id FROM agendamentos WHERE profissional_id=${b.profissionalId} AND status<>'Cancelado' AND inicio<${end.toISOString()} AND fim>${start.toISOString()}`;
          if (collision.length)
            throw new Conflict(
              "Há atendimento neste período. Cancele ou remarque antes de bloquear.",
            );
          await tx`INSERT INTO bloqueios(profissional_id,inicio,fim,motivo) VALUES(${b.profissionalId},${start.toISOString()},${end.toISOString()},${b.motivo})`;
        } else {
          if (b.diaInteiro)
            throw new Conflict("Informe início e fim do horário extra.");
          if (weekday(b.data) < 2 || weekday(b.data) > 6)
            throw new Conflict("A barbearia atende somente de terça a sábado.");
          await tx`INSERT INTO horarios_extras(profissional_id,data,inicio,fim) VALUES(${b.profissionalId},${b.data},${b.inicio},${b.fim})`;
        }
        return { ok: true };
      }
      if (resource === "remove-period") {
        const b = z
          .object({ id, kind: z.enum(["blocks", "extras"]) })
          .parse(body);
        if (b.kind === "blocks")
          await tx`DELETE FROM bloqueios WHERE id=${b.id}`;
        else await tx`DELETE FROM horarios_extras WHERE id=${b.id}`;
        return { ok: true };
      }
      if (resource === "december") {
        const b = z
          .object({
            year: z
              .number()
              .int()
              .min(Number(today().slice(0, 4)))
              .max(Number(today().slice(0, 4)) + 1),
            active: z.boolean(),
          })
          .parse(body);
        if (b.active)
          await tx`INSERT INTO agenda_liberacoes(inicio,fim,tipo) VALUES(${b.year + "-12-01"},${b.year + "-12-31"},'dezembro') ON CONFLICT(inicio,tipo) DO NOTHING`;
        else
          await tx`DELETE FROM agenda_liberacoes WHERE tipo='dezembro' AND inicio=${b.year + "-12-01"}`;
        return { ok: true };
      }
      throw new Conflict("Operação desconhecida.");
    });
    return reply(result);
  } catch (error) {
    return fail(error);
  }
}
