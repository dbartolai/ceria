import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { getLinkedStudents, rows } from "@/lib/portal-data";

export const metadata: Metadata = { title: "Billing" };

type Invoice = {
  id: string;
  student_id: string;
  title: string;
  amount_cents: number;
  currency: string;
  status: "open" | "paid" | "void";
  hosted_url: string;
  due_at: string | null;
};

const labels = { open: "Open", paid: "Paid", void: "Void" };

export default async function BillingPage() {
  const { db, person } = await requireRole("guardian");
  const [linked, invoiceResult, portal] = await Promise.all([
    getLinkedStudents(db),
    db.from("invoices").select("*").order("due_at", { ascending: false, nullsFirst: false }).returns<Invoice[]>(),
    db.from("payment_portals").select("hosted_url").eq("guardian_id", person.id).maybeSingle(),
  ]);
  const invoices = rows(invoiceResult, "invoices");
  if (portal.error) throw new Error("Payment options could not be loaded.", { cause: portal.error });
  return <>
    <header className="page-intro"><h1>Billing</h1><p>View invoices and manage your payment information securely through Stripe.</p></header>
    <div className="dashboard-columns">
      <section className="stack"><h2>Invoices</h2>
        {invoices.length ? <div className="stack">
          {invoices.map((invoice) => <article className="panel stack" key={invoice.id}>
            <div className="row spread align-start"><div>
              <p className="eyebrow">{linked.find((student) => student.id === invoice.student_id)?.name}</p>
              <h3>{invoice.title}</h3>
            </div><span className={invoice.status === "open" ? "status warm" : invoice.status === "void" ? "status neutral" : "status"}>{labels[invoice.status]}</span></div>
            <div className="row spread">
              <p className="numeric">{formatMoney(invoice.amount_cents, invoice.currency)}
                {invoice.due_at && <small className="muted"> · Due {formatDate(invoice.due_at)}</small>}
              </p>
              {invoice.status !== "void" && <a className="button secondary" href={invoice.hosted_url} target="_blank" rel="noreferrer">
                {invoice.status === "open" ? "View and pay" : "View invoice"} <ExternalLink size={14} aria-hidden />
              </a>}
            </div>
          </article>)}
        </div> : <p className="empty">You have no invoices yet.</p>}
      </section>
      <section className="panel stack"><h2>Payment methods</h2>
        {portal.data?.hosted_url ? <>
          <p className="muted">Stripe will verify your billing email before you can update your details.</p>
          <a className="button secondary" href={portal.data.hosted_url} target="_blank" rel="noreferrer">
            Manage payment methods <ExternalLink size={14} aria-hidden />
          </a>
        </> : <p className="muted">Your tutor can add a link to your Stripe billing account.</p>}
      </section>
    </div>
  </>;
}
