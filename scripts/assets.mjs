import sharp from "sharp";
import { mkdirSync } from "node:fs";
mkdirSync("public", { recursive: true });
// Extração literal da marca aprovada: nenhum redesenho ou geração de logo.
await sharp("../Preview_Admin_01_Dashboard.png")
  .extract({ left: 121, top: 151, width: 101, height: 107 })
  .resize(202, 214)
  .webp({ lossless: true })
  .toFile("public/black-logo.webp");
console.log("Logo extraída da referência; original preservado.");
