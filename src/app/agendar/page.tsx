import type { Metadata } from "next";
import PublicBooking from "@/components/public-booking";
import "./public.css";
import "./public-retheme.css";
export const metadata: Metadata = {
  title: "Agende seu horário | Sistema de Agendamento para Barbearias",
  description:
    "Seu próximo corte começa aqui. Escolha seu serviço e agende na Sistema de Agendamento para Barbearias.",
};
export default function Page() {
  return <PublicBooking />;
}
