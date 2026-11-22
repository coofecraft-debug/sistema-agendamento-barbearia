import type { Metadata } from "next";
import { actionPreview } from "@/lib/comunicacao";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title:"Confirmar ou cancelar | Sistema de Agendamento para Barbearias",robots:{index:false,follow:false},referrer:"origin" };
export default async function ActionPage({searchParams}:{searchParams:Promise<{token?:string}>}) {
  const { token="" } = await searchParams;
  const details = await actionPreview(token);
  return <main style={{minHeight:"100dvh",background:"#10110f",color:"#f4eddb",display:"grid",placeItems:"center",padding:20}}>
    <section style={{maxWidth:430,width:"100%",padding:28,border:"1px solid #8a713f",borderRadius:18,background:"#1c1b17"}}>
      <h1 style={{color:"#ecc773"}}>Sistema de Agendamento para Barbearias</h1>
      {!details?.valido ? <p>Este link é inválido, já foi utilizado ou expirou. Entre em contato com a barbearia.</p> : <>
        <p>{details.acao==="confirmar"?"Deseja confirmar seu atendimento?":"Deseja cancelar seu atendimento?"}</p>
        <p>{details.servico} — {details.data}, às {details.horario}</p>
        <form action="/api/acao" method="POST">
          <input type="hidden" name="token" value={token}/>
          <button style={{width:"100%",minHeight:54,border:0,borderRadius:8,background:details.acao==="cancelar"?"#b96a4d":"#e8c36f",color:"#1c1a12",fontWeight:700}} type="submit">
            {details.acao==="cancelar"?"Confirmar cancelamento":"Confirmar presença"}
          </button>
        </form>
        <p style={{fontSize:12,color:"#aaa396"}}>Esta ação só será realizada quando você tocar no botão. Não compartilhe este link.</p>
      </>}
    </section>
  </main>;
}
