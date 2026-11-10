import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { requirePerson } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { rows } from "@/lib/portal-data";

export const metadata: Metadata = { title: "Notifications" };

async function markAsRead() {
  "use server";
  const { db } = await requirePerson();
  const { error } = await db.rpc("read_notifications");
  if (error) throw new Error("Notifications could not be marked as read.", { cause: error });
  revalidatePath("/portal", "layout");
}

export default async function Notifications() {
  const { person, db } = await requirePerson();
  const notifications = rows(await db.from("notifications").select("id,title,body,href,created_at,read_at")
    .eq("recipient_id", person.id).order("created_at", { ascending: false }).limit(50), "notifications");
  return <>
    <header className="page-intro"><h1>Notifications</h1></header>
    <div className="stack content-column">
      {notifications.some((item) => !item.read_at) && <form action={markAsRead}>
        <button className="button secondary">Mark all as read</button>
      </form>}
      {notifications.length ? <div className="panel rule-list">
        {notifications.map((item) => <article className="row spread" key={item.id}>
          <div className="stack">
            <div className="row"><h3>{item.title}</h3>{!item.read_at && <span className="status warm">New</span>}</div>
            <p>{item.body}</p>
            <small className="muted">{formatDateTime(item.created_at)}</small>
          </div>
          <Link className="section-link" href={item.href}>Open</Link>
        </article>)}
      </div> : <p className="empty">You have no notifications yet.</p>}
    </div>
  </>;
}
