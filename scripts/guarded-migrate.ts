import { assertLocal } from "./local-guard";
assertLocal();
await import("./migrate");
