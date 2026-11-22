import { z } from "zod";
import { date, id, time } from "./validation";
export const phoneSchema = z
  .string()
  .max(24)
  .transform((v) => {
    const digits = v.replace(/\D/g, "");
    return digits.length === 13 && digits.startsWith("55")
      ? digits.slice(2)
      : digits;
  })
  .pipe(
    z
      .string()
      .regex(
        /^[1-9]{2}9\d{8}$/,
        "Informe um WhatsApp válido com DDD e 9 dígitos.",
      ),
  );
export const identitySchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(5)
      .max(100)
      .regex(
        /^[\p{L}\p{M}]+(?:[ '\-][\p{L}\p{M}]+)+$/u,
        "Informe seu nome completo.",
      ),
    whatsapp: phoneSchema,
    website: z.literal("").default(""),
    permiteNotificacoes: z.boolean().default(false),
    permiteConvites: z.boolean().default(false),
  })
  .strict();
export const publicAvailabilitySchema = z
  .object({
    servicoId: id,
    from: date,
    days: z.number().int().min(1).max(31).default(31),
  })
  .strict();
export const publicBookingSchema = z
  .object({
    nome: identitySchema.shape.nome,
    whatsapp: phoneSchema,
    servicoId: id,
    data: date,
    horario: time,
    profissionalId: id,
    precoCentavos: z.number().int().min(0),
    duracao: z.number().int().min(15).max(240),
    chave: z.uuid(),
    website: z.literal("").default(""),
  })
  .strict();
export type PublicService = {
  id: number;
  nome: string;
  precoCentavos: number;
  duracao: number;
};
export type PublicReceipt = {
  status?: string;
  protocolo: string;
  nome: string;
  servico: string;
  data: string;
  horario: string;
  profissional: string;
  precoCentavos: number;
  duracao: number;
  inicio: string;
  fim: string;
};
export type PublicAvailability = {
  profissional: { id: number; nome: string } | null;
  dias: { data: string; horarios: string[]; melhoresEncaixes: string[] }[];
};
export type PublicBootstrap = {
  servicos: PublicService[];
  hoje: string;
  meses: string[];
  identidade: { nome: string; whatsapp: string; permiteNotificacoes: boolean; permiteConvites: boolean } | null;
};
