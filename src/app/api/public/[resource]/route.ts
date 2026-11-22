import { publicWeekEnd, publicWeekReleased } from "@/lib/time";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/db";
import { scheduleMessages } from "@/lib/comunicacao";
import { saveCommunicationPreferences } from "@/lib/communication-preferences";
import { checkOrigin, digest } from "@/lib/auth";
import { publicAvailability as availability, syncRelease } from "@/lib/scheduling";
import { addDays, instant, localTime, monday, today } from "@/lib/time";
import {
  assignedProfessional,
  limit,
  phoneLimitKey,
  PublicError,
  publicSession,
} from "@/lib/public-booking";
import {
  identitySchema,
  publicAvailabilitySchema,
  publicBookingSchema,
  type PublicReceipt,
} from "@/lib/public-validation";
export const runtime = "nodejs";
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(status === 429 ? { "Retry-After": "900" } : {}),
    },
  });
type Context = { params: Promise<{ resource: string }> };
async function body(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new PublicError("Formato inválido.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new PublicError("Dados inválidos.", 400);
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      throw new PublicError("Requisição muito grande.", 413);
    }
    parts.push(chunk.value);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
function fail(error: unknown) {
  if (error instanceof PublicError)
    return reply({ error: error.message, code: error.code }, error.status);
  if (error instanceof z.ZodError)
    return reply(
      { error: error.issues[0]?.message ?? "Confira os dados." },
      400,
    );
  if (error instanceof SyntaxError)
    return reply({ error: "Dados inválidos." }, 400);
  const e = error as { code?: string; message?: string };
  if (e.message === "ORIGIN")
    return reply({ error: "Origem não autorizada." }, 403);
  if (["23P01", "23505"].includes(e.code ?? ""))
    return reply(
      {
        error: "Este horário acabou de ser ocupado. Escolha outro.",
        code: "SLOT",
      },
      409,
    );
  console.error("Falha no agendamento público", e.code ?? "internal");
  return reply({ error: "Não foi possível concluir. Tente novamente." }, 500);
}
export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const { resource } = await context.params;
    if (
      !["bootstrap", "availability", "identify", "booking", "receipt"].includes(
        resource,
      )
    )
      return reply({ error: "Não encontrado." }, 404);
    await limit("requests:global", 4000, 300);
    const input = await body(request);
    const session = await publicSession(resource === "bootstrap");
    await limit("session:" + session.hash, 180, 300);
    if (resource === "bootstrap") {
      z.object({}).strict().parse(input);
      await syncRelease();
      const services =
        await sql`SELECT id,nome,preco_centavos AS "precoCentavos",duracao FROM servicos WHERE ativo ORDER BY id`;
      const current = today();
      // Exibe apenas o(s) mes(es) da semana de atendimento vigente.
      // released() e freeSlots() impedem atendimentos em dias fechados,
      // horários passados, bloqueados ou já ocupados.
      const last = publicWeekEnd();
      const months = new Set<string>([current.slice(0, 7)]);
      for (let day = current; day <= last; day = addDays(day, 1)) {
        months.add(day.slice(0, 7));
      }
      return reply({
        servicos: services,
        hoje: current,
        meses: [...months].sort(),
        identidade: session.whatsapp
          ? { nome: session.nome, whatsapp: session.whatsapp, permiteNotificacoes: session.permite_notificacoes, permiteConvites: session.permite_convites }
          : null,
      });
    }
    if (resource === "receipt") {
      const b = z.object({ chave: z.uuid() }).strict().parse(input);
      const [row] =
        await sql`SELECT r.comprovante,a.inicio,a.fim,a.status,a.preco_centavos,p.nome AS profissional FROM public_reservas r JOIN agendamentos a ON a.chave=r.chave JOIN profissionais p ON p.id=a.profissional_id WHERE r.chave=${b.chave} AND r.sessao_hash=${session.hash}`;
      return row
        ? reply({
            ...row.comprovante,
            status: row.status,
            data: today(new Date(row.inicio)),
            horario: localTime(row.inicio),
            inicio: row.inicio,
            fim: row.fim,
            profissional: row.profissional,
            precoCentavos: row.preco_centavos,
            duracao:
              (new Date(row.fim).getTime() - new Date(row.inicio).getTime()) /
              60000,
          })
        : reply({ error: "Comprovante não encontrado." }, 404);
    }
    if (resource === "identify") {
      await limit("identity:" + session.hash, 15);
      const b = identitySchema.parse(input);
      await limit("identity-phone:" + phoneLimitKey(b.whatsapp), 30);
      const { professional } = await assignedProfessional(sql, b.whatsapp);
      await sql`UPDATE public_sessoes SET nome=${b.nome},whatsapp=${b.whatsapp},permite_notificacoes=${b.permiteNotificacoes},permite_convites=${b.permiteConvites} WHERE hash=${session.hash}`;
      return reply({ profissional: professional });
    }
    if (resource === "availability") {
      const b = publicAvailabilitySchema.parse(input);
      if (
        b.from < today().slice(0, 7) + "-01" ||
        b.from > Number(today().slice(0, 4)) + 1 + "-12-31"
      )
        throw new PublicError("Selecione uma data liberada.");
      const [service] =
        await sql`SELECT duracao FROM servicos WHERE id=${b.servicoId} AND ativo`;
      if (!service) throw new PublicError("Serviço indisponível.");
      const [professional] =
        await sql`SELECT id,nome FROM profissionais WHERE ativo AND papel='dono' LIMIT 1`;
      if (!professional)
        throw new PublicError("Agenda indisponível no momento. Fale com a barbearia.");
      const days = await availability(
        sql,
        b.from,
        b.days,
        service.duracao,
        professional?.id,
      );
      return reply({
        profissional: professional,
        dias: days
          .filter((d) => d.liberado && publicWeekReleased(d.data))
          .map((d) => ({
            data: d.data,
            horarios: [
              ...new Set(d.profissionais.flatMap((p) => p.horarios)),
            ].sort(),
            // Até uma sugestão por período; a confirmação sempre revalida
            // o profissional específico após identificar o cliente.
            melhoresEncaixes: [...new Set(
              d.profissionais.flatMap((p) => p.melhoresEncaixes),
            )].sort().filter((slot, index, all) =>
              all.findIndex((other) =>
                (other < "12:00") === (slot < "12:00"),
              ) === index,
            ),
          }))
          .filter((d) => d.horarios.length),
      });
    }
    const b = publicBookingSchema.parse(input);
    // V3: negar reserva fora da semana publica, inclusive requisicoes diretas.
    if (!publicWeekReleased(b.data)) {
      throw new PublicError("Agendamentos disponíveis somente de terça a sábado da semana atual.", 400, "SLOT");
    }
    if (!session.whatsapp || !session.nome)
      throw new PublicError(
        "Informe seu nome e WhatsApp para continuar.",
        400,
        "IDENTITY",
      );
    if (b.nome !== session.nome || b.whatsapp !== session.whatsapp)
      throw new PublicError("Seus dados foram alterados em outra aba. Confira seu nome e WhatsApp novamente.",409,"IDENTITY");
    await limit("booking:" + session.hash, 20);
    const fingerprint = digest(
      JSON.stringify({ ...b, nome: session.nome, whatsapp: session.whatsapp }),
    );
    const result = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(19442003)`;
      const [existing] =
        await tx`SELECT * FROM public_reservas WHERE chave=${b.chave}`;
      if (existing) {
        if (
          existing.sessao_hash !== session.hash ||
          existing.pedido_hash !== fingerprint
        )
          throw new PublicError(
            "Esta confirmação não corresponde à solicitação original.",
            409,
            "IDEMPOTENCY",
          );
        return existing.comprovante;
      }
      const { client, professional } = await assignedProfessional(
        tx,
        session.whatsapp,
      );
      if (professional.id !== b.profissionalId)
        throw new PublicError(
          "O profissional do seu cadastro foi atualizado. Confira os horários novamente.",
          409,
          "SLOT",
        );
      const [service] =
        await tx`SELECT * FROM servicos WHERE id=${b.servicoId} AND ativo`;
      if (
        !service ||
        service.preco_centavos !== b.precoCentavos ||
        service.duracao !== b.duracao
      )
        throw new PublicError(
          "O serviço foi atualizado. Confira o valor e a duração antes de confirmar.",
          409,
          "SERVICE",
        );
      const days = await availability(
        tx,
        b.data,
        1,
        service.duracao,
        professional.id,
      );
      if (!days[0]?.profissionais[0]?.horarios.includes(b.horario))
        throw new PublicError(
          "Este horário não está mais disponível para seu profissional. Escolha outro horário.",
          409,
          "SLOT",
        );
      // Count successful bookings under the same lock. Retries never consume this quota.
      const [count] =
        await tx`SELECT count(*)::int AS n FROM public_reservas r JOIN agendamentos a ON a.chave=r.chave JOIN clientes c ON c.id=a.cliente_id WHERE (c.whatsapp=${session.whatsapp} OR c.whatsapp=${"55" + session.whatsapp}) AND a.status <> 'Cancelado' AND r.criado_em>now()-interval '24 hours'`;
      if (count.n >= 3)
        throw new PublicError(
          "Você já fez três agendamentos hoje. Fale com a barbearia se precisar de ajuda.",
          429,
          "RATE_LIMIT",
        );
      const customer =
        client ??
        (
          await tx`INSERT INTO clientes(nome,whatsapp) VALUES(${session.nome},${session.whatsapp}) RETURNING id`
        )[0];
      const start = instant(b.data, b.horario),
        end = new Date(start.getTime() + service.duracao * 60000);
      const [appointment] =
        await tx`INSERT INTO agendamentos(cliente_id,servico_id,profissional_id,inicio,fim,preco_centavos,chave) VALUES(${customer.id},${service.id},${professional.id},${start.toISOString()},${end.toISOString()},${service.preco_centavos},${b.chave}) RETURNING id`;
      await tx`INSERT INTO comunicacao_consentimentos(agendamento_id,autorizado,origem) VALUES(${appointment.id},${session.permite_notificacoes},'publico')`;
      await saveCommunicationPreferences(tx, customer.id, session.whatsapp, {
        convites: session.permite_convites, notificacoes: session.permite_notificacoes,
      }, "publico");
      await scheduleMessages(tx, appointment.id);
      const receipt: PublicReceipt = {
        protocolo: appointment.id,
        nome: session.nome,
        servico: service.nome,
        data: b.data,
        horario: b.horario,
        profissional: professional.nome,
        precoCentavos: service.preco_centavos,
        duracao: service.duracao,
        inicio: start.toISOString(),
        fim: end.toISOString(),
      };
      await tx`INSERT INTO public_reservas(chave,sessao_hash,pedido_hash,comprovante) VALUES(${b.chave},${session.hash},${fingerprint},${JSON.stringify(receipt)}::jsonb)`;
      return receipt;
    });
    return reply(result);
  } catch (error) {
    return fail(error);
  }
}
