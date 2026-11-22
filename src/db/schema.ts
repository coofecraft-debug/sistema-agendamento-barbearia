import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  uuid,
  timestamp,
  date,
  time,
} from "drizzle-orm/pg-core";
export const profissionais = pgTable("profissionais", {
  id: serial().primaryKey(),
  nome: text().notNull(),
  papel: text().notNull(),
  ativo: boolean().notNull().default(true),
});
export const clientes = pgTable("clientes", {
  id: serial().primaryKey(),
  nome: text().notNull(),
  whatsapp: text().notNull().unique(),
  fixo: boolean().notNull().default(false),
  profissionalPreferencial: integer("profissional_preferencial").references(
    () => profissionais.id,
  ),
  observacoes: text().notNull().default(""),
});
export const servicos = pgTable("servicos", {
  id: serial().primaryKey(),
  nome: text().notNull(),
  precoCentavos: integer("preco_centavos").notNull(),
  duracao: integer().notNull(),
  ativo: boolean().notNull().default(true),
});
export const expediente = pgTable("expediente", {
  id: serial().primaryKey(),
  profissionalId: integer("profissional_id")
    .notNull()
    .references(() => profissionais.id),
  diaSemana: integer("dia_semana").notNull(),
  inicio: time().notNull(),
  fim: time().notNull(),
});
export const agendamentos = pgTable("agendamentos", {
  id: uuid().primaryKey().defaultRandom(),
  clienteId: integer("cliente_id")
    .notNull()
    .references(() => clientes.id),
  servicoId: integer("servico_id")
    .notNull()
    .references(() => servicos.id),
  profissionalId: integer("profissional_id")
    .notNull()
    .references(() => profissionais.id),
  inicio: timestamp({ withTimezone: true }).notNull(),
  fim: timestamp({ withTimezone: true }).notNull(),
  status: text().notNull().default("Agendado"),
  precoCentavos: integer("preco_centavos").notNull(),
  observacoes: text().notNull().default(""),
  chave: uuid().notNull().unique(),
});
export const liberacoes = pgTable("agenda_liberacoes", {
  id: serial().primaryKey(),
  inicio: date().notNull(),
  fim: date().notNull(),
  tipo: text().notNull(),
});
