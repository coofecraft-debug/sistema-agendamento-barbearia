import { z } from "zod";
z.config(z.locales.pt());
export const id = z.coerce.number().int().positive();
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Data inválida",
  );
export const time = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  .refine((v) => Number(v.slice(3)) % 15 === 0, "Use intervalos de 15 minutos");
export const clientSchema = z.object({
  id: id.optional(),
  nome: z.string().trim().min(2).max(100),
  whatsapp: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().regex(/^\d{10,13}$/, "Informe DDD e telefone")),
  fixo: z.boolean(),
  permiteConvites: z.boolean().optional(),
  conviteSemanalAtivo: z.boolean().optional(),
  profissional_preferencial: id.nullable(),
  observacoes: z.string().trim().max(1000).default(""),
});
export const serviceSchema = z.object({
  id: id.optional(),
  nome: z.string().trim().min(2).max(60),
  precoCentavos: z.number().int().min(0).max(1000000),
  duracao: z.number().int().min(15).max(240).multipleOf(15),
  ativo: z.boolean(),
});
export const bookingSchema = z.object({
  id: z.uuid().optional(),
  clienteId: id,
  permiteNotificacoes: z.boolean().optional(),
  servicoId: id,
  profissionalId: id,
  data: date,
  horario: time,
  observacoes: z.string().trim().max(200).default(""),
  chave: z.uuid(),
});
export const statusSchema = z.object({
  id: z.uuid(),
  status: z.enum([
    "Agendado",
    "Confirmado",
    "Cancelado",
    "Concluído",
    "Faltou",
  ]),
});
export const periodSchema = z
  .object({
    profissionalId: id,
    data: date,
    inicio: time,
    fim: time,
    motivo: z.string().trim().max(200).default(""),
    diaInteiro: z.boolean().default(false),
  })
  .refine(
    (v) => v.diaInteiro || v.inicio < v.fim,
    "O fim deve ser posterior ao início",
  );
export const hoursSchema = z
  .object({
    profissionalId: id,
    diaSemana: z.number().int().min(2).max(6),
    periodos: z
      .array(
        z.object({ inicio: time, fim: time }).refine((v) => v.inicio < v.fim),
      )
      .max(4),
  })
  .refine(
    (v) =>
      v.periodos.every((p, i) =>
        v.periodos.every(
          (q, j) => i === j || p.inicio >= q.fim || p.fim <= q.inicio,
        ),
      ),
    "Os períodos não podem se sobrepor",
  );
