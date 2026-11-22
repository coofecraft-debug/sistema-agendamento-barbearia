import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ActionResult({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const message =
    status === "confirmado"
      ? "Presença confirmada!"
      : status === "cancelado"
        ? "Agendamento cancelado. O horário foi liberado."
        : status === "erro"
          ? "Não foi possível concluir a ação. Entre em contato com a barbearia se o problema continuar."
          : "O link não é mais válido. Entre em contato com a barbearia.";

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "#11120f",
        display: "grid",
        placeItems: "center",
        padding: 20,
        color: "#f4eddb",
      }}
    >
      <section
        style={{
          maxWidth: 420,
          border: "1px solid #a98a48",
          padding: 28,
          borderRadius: 16,
        }}
      >
        <h1>Sistema de Agendamento para Barbearias</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
