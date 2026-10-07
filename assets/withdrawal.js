(function () {
  "use strict";
  const form = document.getElementById("withdrawal-form");
  if (!form) return;
  const summary = document.getElementById("withdrawal-summary");
  const summaryText = document.getElementById("summary-text");
  const status = document.getElementById("withdrawal-status");
  const confirm = document.getElementById("confirm");
  let key = null;
  let confirmedPayload = null;
  let sending = false;

  function payload() { return Object.fromEntries(new FormData(form).entries()); }
  function parisParts(value) {
    const date = new Date(value);
    return {
      date: new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(date),
      time: new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(date)
    };
  }
  form.addEventListener("input", () => { if (!form.hidden) { key = null; confirmedPayload = null; } });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = payload();
    confirmedPayload = Object.freeze({ ...data });
    summaryText.textContent = `Vous êtes sur le point de vous rétracter de la commande ${data.orderReference} pour : ${data.products.trim() || "toute la commande"}. Un accusé de réception vous sera envoyé à ${data.email}.`;
    key = crypto.randomUUID();
    form.hidden = true; summary.hidden = false; status.hidden = true;
  });
  document.getElementById("edit").addEventListener("click", () => { key = null; confirmedPayload = null; summary.hidden = true; status.hidden = true; form.hidden = false; });
  confirm.addEventListener("click", async () => {
    if (sending) return;
    sending = true; confirm.disabled = true;
    try {
      const response = await fetch("/api/withdrawal-request", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(confirmedPayload) });
      if (!response.ok) throw new Error("request_failed");
      const result = await response.json();
      const parts = parisParts(result.recordedAt);
      form.hidden = true; summary.hidden = true; status.hidden = false;
      status.textContent = `Votre demande de rétractation a été enregistrée le ${parts.date} à ${parts.time}. Un accusé de réception vous a été envoyé par email. Nous revenons vers vous pour les modalités de retour.`;
    } catch {
      status.hidden = false;
      status.textContent = "Votre demande n'a pas pu être enregistrée. Réessayez dans quelques instants. Vous pouvez aussi nous notifier votre rétractation par email à contact@dynastiedorkhan.com ou par courrier, avec le formulaire de rétractation des CGV.";
    } finally { sending = false; confirm.disabled = false; }
  });
}());
