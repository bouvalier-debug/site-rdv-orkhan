const CONNECTED_MEDAL_PUBLIC_PRICE_CENTS = 1999;
const CONNECTED_MEDAL_FAMILY_PRICE_CENTS = 1799;
const CONNECTED_MEDAL_FR_SHIPPING_CENTS = 350;
const CONNECTED_MEDAL_BE_SHIPPING_CENTS = 490;

const form = document.getElementById("connected-order");
const delivery = document.getElementById("delivery");
const quantity = document.getElementById("quantity");
const familyInputs = [...form.querySelectorAll('input[name="famille_dynastie"]')];
const addressFields = document.getElementById("address-fields");
const relayField = document.getElementById("relay-field");
const country = document.getElementById("country");
const summary = {
  quantity: document.getElementById("summary-quantity"),
  unit: document.getElementById("summary-unit"),
  subtotal: document.getElementById("summary-subtotal"),
  delivery: document.getElementById("summary-delivery"),
  shipping: document.getElementById("summary-shipping"),
  total: document.getElementById("summary-total")
};

function euro(cents){return new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(cents/100)}
function family(){return familyInputs.find(input=>input.checked)?.value === "oui"}
function shipping(){return delivery.value === "france" ? CONNECTED_MEDAL_FR_SHIPPING_CENTS : delivery.value === "belgique" ? CONNECTED_MEDAL_BE_SHIPPING_CENTS : 0}
function deliveryLabel(){return delivery.options[delivery.selectedIndex]?.text || "À choisir"}
function updateConditionalFields(){
  const shipped = delivery.value === "france" || delivery.value === "belgique" || delivery.value === "autre";
  addressFields.classList.toggle("visible", shipped);
  addressFields.querySelectorAll("input, select").forEach(field=>field.required=shipped);
  relayField.classList.toggle("visible", delivery.value === "belgique");
  if(delivery.value === "france") country.value="France";
  if(delivery.value === "belgique") country.value="Belgique";
  if(delivery.value === "retrait") country.value="France";
}
function updateSummary(){
  const qty=Math.max(1,Math.min(20,Number(quantity.value)||1));
  const unit=family()?CONNECTED_MEDAL_FAMILY_PRICE_CENTS:CONNECTED_MEDAL_PUBLIC_PRICE_CENTS;
  const subtotal=qty*unit;
  const deliveryFee=shipping();
  summary.quantity.textContent=String(qty);
  summary.unit.textContent=euro(unit);
  summary.subtotal.textContent=euro(subtotal);
  summary.delivery.textContent=deliveryLabel();
  summary.shipping.textContent=delivery.value==="autre"?"À confirmer":euro(deliveryFee);
  summary.total.textContent=delivery.value==="autre"?`${euro(subtotal)} + expédition`:euro(subtotal+deliveryFee);
}
function refresh(){updateConditionalFields();updateSummary()}
delivery.addEventListener("change",refresh);quantity.addEventListener("input",updateSummary);familyInputs.forEach(input=>input.addEventListener("change",updateSummary));refresh();

form.addEventListener("submit",async(event)=>{
  event.preventDefault();
  const button=form.querySelector('button[type="submit"]');
  const errors=document.getElementById("form-errors");
  const success=document.getElementById("form-success");
  errors.classList.remove("visible");success.classList.remove("visible");
  if(!form.reportValidity())return;
  button.disabled=true;button.textContent="Envoi en cours…";
  const payload=Object.fromEntries(new FormData(form));
  payload.type="medaille-connectee";
  payload.submissionId=crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  try{
    const response=await fetch("/api/medaille-webhook",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    if(!response.ok)throw new Error();
    form.reset();quantity.value="1";delivery.value="retrait";document.getElementById("family-no").checked=true;refresh();
    success.classList.add("visible");success.focus();
  }catch{
    errors.textContent="L’envoi n’a pas abouti. Merci de réessayer dans quelques instants ou de nous contacter directement.";
    errors.classList.add("visible");errors.focus();
  }finally{button.disabled=false;button.textContent="Envoyer ma demande de commande"}
});
