export function assertLocal() {
  if (process.env.ALLOW_LOCAL_SETUP !== "black-open-source") {
    throw new Error("Instalacao nao autorizada");
  }

  const connection = process.env.DATABASE_URL;

  if (!connection) {
    throw new Error("DATABASE_URL obrigatoria");
  }

  let url: URL;

  try {
    url = new URL(connection);
  } catch {
    throw new Error("DATABASE_URL invalida");
  }

  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "db" ||
    (url.port !== "" && url.port !== "5432") ||
    url.pathname !== "/black_agenda" ||
    decodeURIComponent(url.username) !== "black_app" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("Instalacao permitida apenas no banco isolado");
  }
}
