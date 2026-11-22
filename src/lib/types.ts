export type Professional = {
  id: number;
  nome: string;
  papel: string;
  ativo: boolean;
};
export type Service = {
  id: number;
  nome: string;
  precoCentavos: number;
  duracao: number;
  ativo: boolean;
};
export type Client = {
  id: number;
  nome: string;
  whatsapp: string;
  fixo: boolean;
  permiteConvites?: boolean;
  conviteSemanalAtivo?: boolean;
  profissional_preferencial: number | null;
  observacoes: string;
  total?: number;
  ultimo?: string | null;
};
export type Appointment = {
  id: string;
  cliente_id: number;
  permite_notificacoes?: boolean;
  servico_id: number;
  profissional_id: number;
  inicio: string;
  fim: string;
  status: string;
  preco_centavos: number;
  observacoes: string;
  cliente: string;
  servico: string;
  cliente_observacoes: string;
};
export type WorkHour = {
  id: number;
  profissional_id: number;
  dia_semana: number;
  inicio: string;
  fim: string;
};
export type Block = {
  id: number;
  profissional_id: number;
  inicio: string;
  fim: string;
  motivo: string;
};
export type Extra = {
  id: number;
  profissional_id: number;
  data: string;
  inicio: string;
  fim: string;
};
export type Release = { id: number; inicio: string; fim: string; tipo: string };
export type Bootstrap = {
  profissionais: Professional[];
  servicos: Service[];
  clientes: Client[];
  expediente: WorkHour[];
  bloqueios: Block[];
  extras: Extra[];
  liberacoes: Release[];
  hoje: string;
  nome: string;
};
export type DayAvailability = {
  data: string;
  liberado: boolean;
  profissionais: { id: number; nome: string; horarios: string[]; melhoresEncaixes: string[] }[];
};
