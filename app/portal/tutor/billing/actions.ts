"use server";

import { invoiceStatuses } from "@/lib/tutor/fields";
import { check, choice, FormError, idField, optionalId, requireClient, required, tutorAction, value } from "@/lib/tutor/validation";

const invoiceHosts = new Set(["invoice.stripe.com", "buy.stripe.com", "pay.stripe.com"]);
const portalHosts = new Set(["billing.stripe.com"]);

function stripeUrl(input: string, allowedHosts: Set<string>) {
  try {
    const url = new URL(input);
    if (url.protocol === "https:" && allowedHosts.has(url.host) && !url.username && !url.password && url.pathname !== "/") {
      return url.href;
    }
  } catch {
    // Report invalid links through the form.
  }
  throw new FormError("Paste a valid Stripe-hosted link.");
}

export async function saveInvoice(form: FormData) {
  return tutorAction(async (db) => {
    const id = optionalId(form, "id");
    const amount = required(form, "amount", "an amount", 12);
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      throw new FormError("Enter a positive amount with up to two decimal places.");
    }
    const due_at = value(form, "due_at", 10) || null;
    if (due_at && !/^\d{4}-\d{2}-\d{2}$/.test(due_at)) throw new FormError("Enter a valid due date.");
    const invoice = {
      title: required(form, "title", "an invoice title", 120),
      amount_cents: Math.round(Number(amount) * 100),
      currency: choice(form, "currency", ["usd", "cad", "eur", "gbp", "aud"] as const),
      status: choice(form, "status", invoiceStatuses),
      hosted_url: stripeUrl(required(form, "hosted_url", "a Stripe invoice or payment link", 2048), invoiceHosts),
      due_at,
    };
    if (id) {
      const { error } = await db.from("invoices").update(invoice).eq("id", id).select("id").single();
      check(error, "The invoice could not be saved.");
      return { message: "Invoice saved." };
    }
    const student_id = idField(form, "student_id");
    await requireClient(db, student_id, "student");
    const { error } = await db.from("invoices").insert({ ...invoice, student_id });
    check(error, "The invoice could not be saved.");
    return { message: "Invoice saved." };
  });
}

export async function savePaymentPortal(form: FormData) {
  return tutorAction(async (db) => {
    const guardian_id = idField(form, "guardian_id");
    const input = value(form, "hosted_url", 2048);
    if (!input) {
      const { error } = await db.from("payment_portals").delete().eq("guardian_id", guardian_id);
      check(error, "The payment portal link could not be removed.");
      return { message: "Payment portal link removed." };
    }
    await requireClient(db, guardian_id, "guardian");
    const hosted_url = stripeUrl(input, portalHosts);
    if (!/^\/p\/login\/[a-zA-Z0-9_-]+\/?$/.test(new URL(hosted_url).pathname)) {
      throw new FormError("Use the persistent customer portal sign-in link from Stripe settings.");
    }
    const { error } = await db.from("payment_portals").upsert({ guardian_id, hosted_url }, { onConflict: "guardian_id" });
    check(error, "The payment portal link could not be saved.");
    return { message: "Payment portal link saved." };
  });
}
