import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Sistema de Agendamento para Barbearias • Administração",
  description: "Agenda e clientes da Sistema de Agendamento para Barbearias",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
