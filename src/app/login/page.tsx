"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { LockKeyhole, ArrowRight } from "lucide-react";
export default function Login() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <section className="login-card">
        <Image
          src="/logo-agenda.svg"
          width={101}
          height={107}
          alt="Sistema de Agendamento para Barbearias"
          priority
        />
        <span className="eyebrow">Sistema de Agendamento para Barbearias</span>
        <h1>Bem-vindo de volta.</h1>
        <p>
          Sua barbearia, organizada.
          <br />
          Entre para cuidar da agenda do dia.
        </p>
        <form
          method="post"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const data = new FormData(e.currentTarget);
            try {
              const res = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: data.get("email"),
                  password: data.get("password"),
                }),
              });
              const json = await res.json();
              if (!res.ok) throw new Error(json.error);
              window.location.assign("/");
            } catch (err) {
              setError((err as Error).message);
              setBusy(false);
            }
          }}
        >
          <label>
            E-mail
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              placeholder="Seu e-mail de administrador"
            />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Sua senha"
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy || !ready}>
            {busy ? "Entrando…" : "Entrar no painel"}
            <ArrowRight size={19} />
          </button>
        </form>
        <small className="secure">
          <LockKeyhole size={14} /> Acesso exclusivo da administração
        </small>
      </section>
    </main>
  );
}
