import type { sql } from "@/db";
import { normalizedBrazilWhatsapp } from "./meta-template";

type Connection = Pick<typeof sql, "unsafe">;
function normalize(phone: string) {
  try { return normalizedBrazilWhatsapp(phone); }
  catch { throw new Error("WHATSAPP_INVALID"); }
}

/** Choosing a recipient is separate from the customer's permission to receive marketing. */
export async function assertWeeklyInvitationNotBlocked(
  tx: Connection, clientId: number, phone: string, enabled: boolean | undefined,
) {
  if (enabled !== true) return;
  const canonical = normalize(phone);
  const [preference] = await tx.unsafe(`SELECT bloqueado FROM comunicacao_preferencias
    WHERE cliente_id=$1 AND whatsapp=$2`, [clientId, canonical]);
  if (preference?.bloqueado) throw new Error("WEEKLY_INVITATION_BLOCKED");
}

export async function saveWeeklyInvitationAudience(
  tx: Connection, clientId: number, phone: string, enabled: boolean | undefined,
  phoneChanged = false,
) {
  if (enabled === undefined && !phoneChanged) return;
  if (enabled !== true) {
    await tx.unsafe(`UPDATE comunicacao_convites_destinatarios SET ativo=false,atualizado_em=now()
      WHERE cliente_id=$1`, [clientId]);
  } else {
    const canonical = normalize(phone);
    const [preference] = await tx.unsafe(`SELECT convites,bloqueado FROM comunicacao_preferencias
      WHERE cliente_id=$1 AND whatsapp=$2`, [clientId, canonical]);
    if (preference?.bloqueado) throw new Error("WEEKLY_INVITATION_BLOCKED");
    if (preference?.convites !== true) throw new Error("WEEKLY_INVITATION_CONSENT_REQUIRED");
    await tx.unsafe(`INSERT INTO comunicacao_convites_destinatarios(cliente_id,whatsapp,ativo)
      VALUES($1,$2,true) ON CONFLICT(cliente_id) DO UPDATE
      SET whatsapp=EXCLUDED.whatsapp,ativo=true,atualizado_em=now()`, [clientId, canonical]);
  }
  // A changed or deactivated selection cannot leave an old queued invitation valid.
  await tx.unsafe(`UPDATE comunicacao_convites SET status='cancelado'
    WHERE cliente_id=$1 AND status='pendente'`, [clientId]);
}
