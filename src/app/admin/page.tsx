import { redirect } from "next/navigation";
import { readDb } from "@/server/store";

export const dynamic = "force-dynamic";

/** /admin opens the first website's dashboard. */
export default async function AdminIndex() {
  const db = await readDb();
  redirect(`/admin/${db.sites[0].key}`);
}
