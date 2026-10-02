const CONNECTED_MEDAL_PUBLIC_PRICE_CENTS = 1999;
const CONNECTED_MEDAL_FAMILY_PRICE_CENTS = 1799;
const CONNECTED_MEDAL_FR_SHIPPING_CENTS = 350;
const CONNECTED_MEDAL_BE_SHIPPING_CENTS = 490;

const form = document.getElementById("connected-order");
const legacyFamilyFieldset = form.querySelector('input[name="famille_dynastie"]')?.closest("fieldset");
const legacySection = form.closest("section");
legacySection.classList.add("legacy-section");
const summaryQuantityRow = document.getElementById("summary-quantity").closest("div");
const summaryRateRow = document.createElement("div");
summaryRateRow.innerHTML = '<dt>Tarif appliqué</dt><dd id="summary-rate">Tarif public</dd>';
summaryQuantityRow.after(summaryRateRow);
const delivery = document.getElementById("delivery");
const quantity = document.getElementById("animoco-cart-quantity");
const chipInput = document.getElementById("family-chip");
const verifyButton = document.getElementById("verify-family-chip");
const familyStatus = document.getElementById("family-status");
const addressFields = document.getElementById("address-fields");
const relayField = document.getElementById("relay-field");
const country = document.getElementById("country");
const summary = {
  quantity: document.getElementById("summary-quantity"),
  rate: document.getElementById("summary-rate"),
  unit: document.getElementById("summary-unit"),
  subtotal: document.getElementById("summary-subtotal"),
  delivery: document.getElementById("summary-delivery"),
  shipping: document.getElementById("summary-shipping"),
  total: document.getElementById("summary-total")
};
let familyEligible = false;
let verifiedChipValue = "";

function euro(cents){return new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(cents/100)}
function shipping(){return delivery.value === "france" ? CONNECTED_MEDAL_FR_SHIPPING_CENTS : delivery.value === "belgique" ? CONNECTED_MEDAL_BE_SHIPPING_CENTS : 0}
function deliveryLabel(){return delivery.options[delivery.selectedIndex]?.text || "À choisir"}
function setFamilyStatus(kind,message){familyStatus.className=`family-status ${kind}`;familyStatus.textContent=message}
function clearFamilyEligibility(){familyEligible=false;verifiedChipValue="";setFamilyStatus("idle","Saisissez les 15 chiffres de la puce pour vérifier votre tarif.");updateSummary()}
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
  const unit=familyEligible?CONNECTED_MEDAL_FAMILY_PRICE_CENTS:CONNECTED_MEDAL_PUBLIC_PRICE_CENTS;
  const subtotal=qty*unit;
  const deliveryFee=shipping();
  summary.quantity.textContent=String(qty);
  summary.rate.textContent=familyEligible?"Tarif famille vérifié":"Tarif public";
  summary.unit.textContent=euro(unit);
  summary.subtotal.textContent=euro(subtotal);
  summary.delivery.textContent=deliveryLabel();
  summary.shipping.textContent=delivery.value==="autre"?"À confirmer":deliveryFee===0?"Gratuit":euro(deliveryFee);
  summary.total.textContent=delivery.value==="autre"?`${euro(subtotal)} + expédition`:euro(subtotal+deliveryFee);
}
function refresh(){updateConditionalFields();updateSummary()}

delivery.addEventListener("change",refresh);
quantity.addEventListener("input",updateSummary);
chipInput.addEventListener("input",()=>{if(chipInput.value!==verifiedChipValue) clearFamilyEligibility()});
verifyButton.addEventListener("click",async()=>{
  verifyButton.disabled=true;
  setFamilyStatus("checking","Vérification en cours…");
  try{
    const response=await fetch("/api/family-eligibility",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chipNumber:chipInput.value})});
    const result=await response.json().catch(()=>({}));
    if(response.status===400&&result.error==="invalid_chip"){
      familyEligible=false;verifiedChipValue="";
      setFamilyStatus("error","Format invalide : saisissez exactement les 15 chiffres de la puce.");
    }else if(!response.ok){
      familyEligible=false;verifiedChipValue="";
      setFamilyStatus("error","Le service de vérification est momentanément indisponible. Vous pouvez commander au tarif public ou réessayer plus tard.");
    }else if(result.recognized===true){
      familyEligible=true;verifiedChipValue=chipInput.value;
      setFamilyStatus("success","Famille Dynastie reconnue : votre tarif de 17,99 € est appliqué.");
    }else{
      familyEligible=false;verifiedChipValue=chipInput.value;
      setFamilyStatus("not-recognized","Cette puce n’est pas reconnue dans le registre actuel. Le tarif public de 19,99 € s’applique. Contactez-nous si vous pensez qu’il s’agit d’une erreur.");
    }
    updateSummary();
  }catch{
    familyEligible=false;verifiedChipValue="";
    setFamilyStatus("error","Le service de vérification est momentanément indisponible. Vous pouvez commander au tarif public ou réessayer plus tard.");
    updateSummary();
  }finally{verifyButton.disabled=false}
});
refresh();

const sharedCart = OrkhanCart.createCartStore();
document.getElementById("add-animoco").addEventListener("click",()=>{
  if(!quantity.reportValidity())return;
  const message=document.getElementById("animoco-cart-message");
  try{
    const line=OrkhanProductCart.animocoLine({quantity:quantity.value,chipNumber:chipInput.value,familyEligible:familyEligible&&chipInput.value===verifiedChipValue});
    OrkhanProductCart.addLine(sharedCart,line);
    OrkhanCart.updateCounters(document,sharedCart.count());
    message.innerHTML='Médaille Animoco ajoutée au panier. <a href="/panier/">Voir mon panier</a>';
    message.classList.add("visible");
  }catch{
    message.textContent="Choisissez une quantité comprise entre 1 et 20.";
    message.classList.add("visible");
  }
});
document.getElementById("show-legacy-animoco").addEventListener("click",()=>{
  legacySection.classList.toggle("visible");
  if(legacySection.classList.contains("visible"))legacySection.scrollIntoView({behavior:"smooth"});
});

form.addEventListener("submit",async(event)=>{
  event.preventDefault();
  const button=form.querySelector('button[type="submit"]');
  const errors=document.getElementById("form-errors");
  const success=document.getElementById("form-success");
  errors.classList.remove("visible");success.classList.remove("visible");
  if(!form.reportValidity())return;
  button.disabled=true;button.textContent="Envoi en cours…";
  const payload=Object.fromEntries(new FormData(form));
  if(chipInput.value.trim()) payload.chipNumber=chipInput.value; else delete payload.chipNumber;
  payload.type="medaille-connectee";
  payload.submissionId=crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  try{
    const response=await fetch("/api/medaille-webhook",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok){
      if(result.error==="invalid_chip") throw new Error("invalid_chip");
      if(result.error==="family_service_unavailable") throw new Error("family_service_unavailable");
      throw new Error("submit_failed");
    }
    form.reset();quantity.value="1";delivery.value="retrait";clearFamilyEligibility();refresh();
    success.classList.add("visible");success.focus();
  }catch(error){
    errors.textContent=error.message==="invalid_chip"
      ?"Le numéro de puce n’est pas valide. Corrigez-le ou laissez le champ vide pour commander au tarif public."
      :error.message==="family_service_unavailable"
        ?"La vérification du tarif famille est momentanément indisponible. Retirez le numéro de puce pour commander au tarif public ou réessayez plus tard."
        :"L’envoi n’a pas abouti. Merci de réessayer dans quelques instants ou de nous contacter directement.";
    errors.classList.add("visible");errors.focus();
  }finally{button.disabled=false;button.textContent="Envoyer ma demande de commande"}
});
