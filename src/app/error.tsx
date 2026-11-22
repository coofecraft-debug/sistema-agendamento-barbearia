"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="login">
      <div className="panel">
        <h1>Vamos tentar novamente?</h1>
        <p>
          Não foi possível carregar o sistema. Verifique se o banco local está
          iniciado.
        </p>
        <button className="primary" onClick={reset}>
          Tentar novamente
        </button>
      </div>
    </main>
  );
}
