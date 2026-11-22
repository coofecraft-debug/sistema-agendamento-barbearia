"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
export const money = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n / 100,
  );
export async function api<T>(resource: string, body?: unknown): Promise<T> {
  const res = await fetch(
    `/api/admin/${resource}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (res.status === 401) {
    window.location.assign("/login");
    throw new Error("Sua sessão expirou.");
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Não foi possível concluir.");
  return json;
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-labelledby="modal-title">
      <header className="modal-heading">
        <div>
          <span className="eyebrow">Sistema de Agendamento para Barbearias</span>
          <h2 id="modal-title">{title}</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Fechar">
          <X />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Badge({ status }: { status: string }) {
  return (
    <span
      className={`badge ${status === "Confirmado" || status === "Concluído" ? "green" : status === "Cancelado" || status === "Faltou" ? "muted" : "gold"}`}
    >
      {status}
    </span>
  );
}
