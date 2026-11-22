import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import Admin from "@/components/admin";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!(await session())) redirect("/login");
  return <Admin />;
}
