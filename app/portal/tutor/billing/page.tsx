import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { ActionForm } from "@/lib/tutor/action-form";
import { invoiceStatuses, type PersonOption } from "@/lib/tutor/fields";
import { Field, TutorIntro } from "@/lib/tutor/ui";
import { saveInvoice, savePaymentPortal } from "./actions";

type Invoice = {
  id: string;
  title: string;
  student_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  due_at: string | null;
  hosted_url: string;
};

function InvoiceForm({ students, invoice }: { students: PersonOption[]; invoice?: Invoice }) {
  const prefix = invoice?.id ?? "new-invoice";
  return (
    <ActionForm action={saveInvoice} label={invoice ? "Save invoice" : "Add invoice"} reset={!invoice}>
      {invoice && <input type="hidden" name="id" value={invoice.id} />}
      {!invoice && <Field name={`${prefix}-student`} label="Student">
        <select name="student_id" id={`${prefix}-student`} defaultValue="" required>
          <option value="" disabled>Choose a student</option>
          {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
        </select>
      </Field>}
      <Field name={`${prefix}-title`} label="Title">
        <input name="title" id={`${prefix}-title`} defaultValue={invoice?.title} maxLength={120} required />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field name={`${prefix}-amount`} label="Amount">
          <input name="amount" id={`${prefix}-amount`} defaultValue={invoice ? (invoice.amount_cents / 100).toFixed(2) : undefined} min="0.01" max="9999999.99" step="0.01" type="number" required />
        </Field>
        <Field name={`${prefix}-currency`} label="Currency">
          <select name="currency" id={`${prefix}-currency`} defaultValue={invoice?.currency ?? "usd"}>
            {["usd", "cad", "eur", "gbp", "aud"].map((currency) => <option key={currency} value={currency}>{currency.toUpperCase()}</option>)}
          </select>
        </Field>
        <Field name={`${prefix}-status`} label="Payment status">
          <select name="status" id={`${prefix}-status`} defaultValue={invoice?.status ?? "open"}>
            {invoiceStatuses.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
          </select>
        </Field>
        <Field name={`${prefix}-due`} label="Due date">
          <input name="due_at" id={`${prefix}-due`} defaultValue={invoice?.due_at ?? ""} type="date" />
        </Field>
      </div>
      <Field name={`${prefix}-link`} label="Stripe invoice or payment link">
        <input name="hosted_url" id={`${prefix}-link`} type="url" defaultValue={invoice?.hosted_url} maxLength={2048} required />
      </Field>
    </ActionForm>
  );
}

export default async function BillingPage() {
  const { db } = await requireRole("tutor");
  const results = await Promise.all([
    db.from("invoices").select("id,title,student_id,amount_cents,currency,status,due_at,hosted_url").order("due_at", { ascending: false, nullsFirst: false }),
    db.from("people").select("id,name,role").in("role", ["student", "guardian"]).order("name"),
    db.from("payment_portals").select("guardian_id,hosted_url"),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const [invoices, people, portals] = results;
  const students = people.data?.filter((person) => person.role === "student") ?? [];
  const guardians = people.data?.filter((person) => person.role === "guardian") ?? [];
  const names = new Map(students.map((student) => [student.id, student.name]));
  const portalLinks = new Map(portals.data?.map((portal) => [portal.guardian_id, portal.hosted_url]));

  return (
    <div className="stack">
      <TutorIntro title="Billing" description="Share Stripe-hosted payment links and record payment status for families." />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="stack">
          <section className="panel stack">
            <h2>Invoices</h2>
            {!invoices.data?.length && <p className="muted">No invoices have been added.</p>}
            {invoices.data?.map((invoice) => (
              <details key={invoice.id} className="border-b border-[var(--border)] pb-3">
                <summary>{invoice.title} · {formatMoney(invoice.amount_cents, invoice.currency)}</summary>
                <p className="muted text-sm mb-4">
                  {names.get(invoice.student_id)} · <span className="capitalize">{invoice.status}</span>
                  {invoice.due_at && ` · Due ${formatDate(invoice.due_at)}`}
                </p>
                <InvoiceForm invoice={invoice} students={students} />
              </details>
            ))}
          </section>
          <section className="panel stack">
            <h2>Payment method access</h2>
            <p className="muted">Set the Stripe customer portal sign-in link for a guardian. Leave it blank to remove access from ceria.</p>
            {!guardians.length && <Link href="/portal/tutor/clients">Add a guardian</Link>}
            {guardians.map((guardian) => (
              <details key={guardian.id} className="border-b border-[var(--border)] pb-3">
                <summary>{guardian.name}{portalLinks.has(guardian.id) && " · Link set"}</summary>
                <ActionForm action={savePaymentPortal} label="Save payment portal link" secondary>
                  <input type="hidden" name="guardian_id" value={guardian.id} />
                  <Field name={`stripe-portal-${guardian.id}`} label="Stripe customer portal link">
                    <input id={`stripe-portal-${guardian.id}`} name="hosted_url" type="url" maxLength={2048} defaultValue={portalLinks.get(guardian.id)} />
                  </Field>
                </ActionForm>
              </details>
            ))}
          </section>
        </div>
        <section className="panel stack self-start">
          <h2>Add an invoice</h2>
          <p className="muted">Create the invoice or payment link in Stripe first. Update the status here when payment clears.</p>
          {students.length ? <InvoiceForm students={students} /> : <Link href="/portal/tutor/clients">Add a student first</Link>}
        </section>
      </div>
    </div>
  );
}
