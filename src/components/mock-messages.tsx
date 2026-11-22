"use client";
import { useEffect, useState } from "react";
import { api } from "./shared";

type Message = {
  canal: string; id: number; tipo: "confirmacao" | "lembrete" | "convite"; status: string;
  executar_em: string; tentativas: number; ultima_falha: string | null;
  meta_entrega_status: string | null; cliente: string;
};
const labels: Record<string, string> = {
  pendente: "Aguardando envio", enviando: "Enviando", enviado: "Aceita pela Meta",
  falhou: "Falha no envio", incerto: "Envio sem confirmação", cancelado: "Envio cancelado",
  simulado: "Simulada", sent: "Enviada", delivered: "Entregue", read: "Lida", failed: "Falha na entrega",
};
export default function MockMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function refresh() {
    setLoading(true);
    try { setMessages(await api<Message[]>("messages")); setError(""); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  return <section className="mock-messages">
    <header className="mock-messages-head">
      <div><h2>Mensagens pelo WhatsApp</h2><p>Confirmações, lembretes e convites com autorização do cliente.</p></div>
      <button type="button" onClick={() => void refresh()} disabled={loading}>Atualizar</button>
    </header>
    {error && <p role="alert" className="error">{error}</p>}
    {!messages.length && !loading && <p>Nenhuma mensagem preparada.</p>}
    <div className="mock-message-list">{messages.map((m) => <article className="panel" key={`${m.canal}-${m.id}`}>
      <div className="mock-message-line">
        <strong>{m.cliente} — {m.tipo === "confirmacao" ? "Confirmação" : m.tipo === "convite" ? "Convite semanal" : "Lembrete"}</strong>
        <span>{labels[m.meta_entrega_status || m.status] || m.status}</span>
      </div>
      <small>Programada: {new Date(m.executar_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</small>
      {m.ultima_falha && <small>{m.ultima_falha}</small>}
      {m.status === "incerto" && <small>Confira no WhatsApp antes de reenviar para evitar duplicidade.</small>}
    </article>)}</div>
  </section>;
}
