import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBAx9HlyjhYMDKwE06UDaAr0eFibXRZfc0",
  authDomain: "voyage-desk-a8209.firebaseapp.com",
  projectId: "voyage-desk-a8209",
  storageBucket: "voyage-desk-a8209.firebasestorage.app",
  messagingSenderId: "342805242383",
  appId: "1:342805242383:web:48918173db1a53ab2ef97a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = initializeFirestore(app, {localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});

const CURRENCIES={"United States":["USD","$"],"Canada":["CAD","C$"],"Mexico":["MXN","$"],"United Kingdom":["GBP","£"],"France":["EUR","€"],"Germany":["EUR","€"],"Italy":["EUR","€"],"Spain":["EUR","€"],"Netherlands":["EUR","€"],"Austria":["EUR","€"],"Hungary":["HUF","Ft"],"Czech Republic":["CZK","Kč"],"Switzerland":["CHF","CHF"],"Poland":["PLN","zł"],"United Arab Emirates":["AED","د.إ"],"India":["INR","₹"],"Jordan":["JOD","د.ا"],"Japan":["JPY","¥"],"South Korea":["KRW","₩"],"Thailand":["THB","฿"],"Singapore":["SGD","S$"],"Australia":["AUD","A$"],"New Zealand":["NZD","NZ$"],"Turkey":["TRY","₺"],"Egypt":["EGP","E£"]};
const TIMEZONES=(()=>{try{return Intl.supportedValuesOf("timeZone")}catch{return["America/New_York","Europe/London","Europe/Budapest","Europe/Prague","Asia/Dubai","Asia/Kolkata","Asia/Tokyo"]}})();
const blank={activeTripId:null,trips:[],records:{itinerary:[],reservations:[],expenses:[],tasks:[],packing:[],documents:[],places:[],contacts:[]}};
let state=structuredClone(blank),user=null,unsubscribe=null,ready=false,saveTimer=null,modalType=null,editingTripId=null,rate=null;

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const uid=()=>crypto.randomUUID();
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n)||0);
const activeTrip=()=>state.trips.find(t=>t.id===state.activeTripId)||null;
const records=t=>state.records[t].filter(x=>x.tripId===state.activeTripId);
const daysTo=d=>d?Math.ceil((new Date(d+"T00:00:00")-new Date())/86400000):null;
const progress=a=>a.length?Math.round(a.filter(x=>x.done).length/a.length*100):0;
const mapLink=a=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a||"")}`;
const nowInZone=z=>z?new Intl.DateTimeFormat("en-US",{timeZone:z,weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date()):"—";

function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1800)}
function switchView(id){$$(".view").forEach(v=>v.classList.toggle("active",v.id===id));$$(".tabs button").forEach(b=>b.classList.toggle("active",b.dataset.view===id));window.scrollTo({top:0,behavior:"smooth"})}
window.switchView=switchView;window.openTripEditor=openTripEditor;window.openModal=openModal;window.refreshRate=refreshRate;
$("#tabs").addEventListener("click",e=>{if(e.target.dataset.view)switchView(e.target.dataset.view)});

$("#googleSignInBtn").onclick=()=>signInWithPopup(auth,provider).catch(e=>$("#loginMessage").textContent=e.message);
$("#signOutBtn").onclick=()=>signOut(auth);

onAuthStateChanged(auth,u=>{
  user=u;
  $("#loginScreen").classList.toggle("hidden",!!u);
  $("#appShell").classList.toggle("hidden",!u);
  if(unsubscribe){unsubscribe();unsubscribe=null}
  if(!u)return;
  const ref=doc(db,"users",u.uid,"app","state");
  unsubscribe=onSnapshot(ref,snap=>{
    ready=false;
    state=snap.exists()?{...structuredClone(blank),...snap.data().data,records:{...structuredClone(blank.records),...(snap.data().data.records||{})}}:structuredClone(blank);
    if(!snap.exists())setDoc(ref,{data:state,updatedAt:serverTimestamp()});
    renderAll();
    setTimeout(()=>ready=true,100);
  },()=>$("#syncStatus").textContent="Sync error");
});

function save(){
  renderAll();
  if(!user||!ready)return;
  $("#syncStatus").textContent="Saving…";
  clearTimeout(saveTimer);
  saveTimer=setTimeout(async()=>{
    try{await setDoc(doc(db,"users",user.uid,"app","state"),{data:state,updatedAt:serverTimestamp()},{merge:true});$("#syncStatus").textContent="Saved"}
    catch{$("#syncStatus").textContent="Sync error"}
  },500);
}

const country=$("#countrySelect");
country.innerHTML='<option value="">Select country</option>'+Object.keys(CURRENCIES).map(c=>`<option>${c}</option>`).join("");
const tzOptions='<option value="">Select time zone</option>'+TIMEZONES.map(z=>`<option>${z}</option>`).join("");
$("#homeTimezoneSelect").innerHTML=tzOptions;$("#destinationTimezoneSelect").innerHTML=tzOptions;

function openTripEditor(id=null){
  editingTripId=id;const t=id?state.trips.find(x=>x.id===id):null,f=$("#tripForm");f.reset();$("#tripModalTitle").textContent=t?"Edit trip":"New trip";
  if(t)[...f.elements].forEach(el=>{if(el.name&&el.name in t)el.value=t[el.name]??""});
  $("#tripModal").showModal()
}
$("#tripForm").addEventListener("submit",e=>{
  e.preventDefault();const o=Object.fromEntries(new FormData(e.currentTarget).entries());o.budget=Number(o.budget||0);o.travelers=Number(o.travelers||1);[o.currency,o.symbol]=CURRENCIES[o.country]||["",""];
  if(editingTripId)Object.assign(state.trips.find(x=>x.id===editingTripId),o);else{o.id=uid();state.trips.push(o);state.activeTripId=o.id}
  editingTripId=null;$("#tripModal").close();save();refreshRate()
});
function deleteTrip(id){if(!confirm("Delete this trip and all of its data?"))return;state.trips=state.trips.filter(t=>t.id!==id);Object.keys(state.records).forEach(k=>state.records[k]=state.records[k].filter(x=>x.tripId!==id));if(state.activeTripId===id)state.activeTripId=state.trips[0]?.id||null;save()}
function setActiveTrip(id){state.activeTripId=id;save();switchView("dashboard")}
window.deleteTrip=deleteTrip;window.setActiveTrip=setActiveTrip;

const schemas={
itinerary:{title:"Add itinerary plan",target:"itinerary",fields:[["date","Date","date"],["start","Start","time"],["end","End","time"],["timezone","Time zone","timezone"],["title","Plan","text"],["type","Type","select",["Sightseeing","Food","Museum","Tour","Shopping","Transportation","Hotel","Free Time","Other"]],["address","Address","text"],["transport","Transportation","text"],["cost","Estimated USD","number"],["status","Status","select",["Idea","Planned","Booked","Completed","Skipped"]],["link","Link","url"],["notes","Notes","textarea"]]},
reservation:{title:"Add reservation",target:"reservations",fields:[["title","Reservation","text"],["type","Type","select",["Flight","Hotel","Train","Tour","Restaurant","Transfer","Rental Car","Event","Other"]],["provider","Provider","text"],["start","Start","datetime-local"],["startTimezone","Start time zone","timezone"],["end","End","datetime-local"],["endTimezone","End time zone","timezone"],["confirmation","Confirmation","text"],["cost","Cost USD","number"],["status","Status","select",["Researching","Held","Confirmed","Cancelled"]],["payment","Payment","select",["Unpaid","Deposit Paid","Paid","Refunded"]],["cancellation","Cancellation deadline","date"],["address","Address / terminal","text"],["link","Booking link","url"],["notes","Notes","textarea"]]},
expense:{title:"Add budget item",target:"expenses",fields:[["date","Date","date"],["category","Category","select",["Flights","Hotels","Transportation","Activities","Food & Dining","Shopping","Insurance","Visas & Fees","Gifts","Miscellaneous"]],["description","Description","text"],["estimated","Estimated USD","number"],["actual","Actual USD","number"],["payment","Status","select",["Planned","Unpaid","Deposit Paid","Paid","Refunded"]],["notes","Notes","textarea"]]},
task:{title:"Add task",target:"tasks",fields:[["name","Task","text"],["category","Category","select",["Before Booking","After Booking","Three Months Before","One Month Before","One Week Before","Departure Day","During Trip","Return Home"]],["due","Due","date"],["priority","Priority","select",["Low","Medium","High","Urgent"]],["notes","Notes","textarea"]]},
packing:{title:"Add packing item",target:"packing",fields:[["name","Item","text"],["category","Category","select",["Clothing","Toiletries","Electronics","Medications","Documents","Flight Essentials","Shoes","Gifts","Wedding","Miscellaneous"]],["quantity","Quantity","number"],["bag","Bag","text"],["traveler","Traveler","text"],["notes","Notes","textarea"]]},
document:{title:"Add document",target:"documents",fields:[["type","Document","select",["Passport","Visa","OCI","Travel Insurance","Flight Ticket","Hotel Confirmation","Tour Voucher","Vaccination Record","Driver's License","Global Entry / PreCheck","Other"]],["traveler","Traveler","text"],["country","Country","text"],["reference","Reference","text"],["issued","Issued","date"],["expiration","Expiration","date"],["status","Status","select",["Not Started","Applied","Pending","Valid","Expired","Not Needed"]],["location","Stored where","text"],["link","Official link","url"],["notes","Notes","textarea"]]},
place:{title:"Add place",target:"places",fields:[["name","Place","text"],["city","City","text"],["type","Type","select",["Attraction","Restaurant","Cafe","Museum","Tour","Neighborhood","Shopping","Day Trip","Photo Spot","Other"]],["priority","Priority","select",["Maybe","Interested","High","Must Do"]],["estimated","Estimated USD","number"],["address","Address","text"],["hours","Hours / best time","text"],["link","Website","url"],["notes","Notes","textarea"]]},
contact:{title:"Add contact",target:"contacts",fields:[["name","Name / organization","text"],["type","Type","select",["Emergency Contact","Embassy / Consulate","Insurance","Airline","Hotel","Tour Company","Bank / Credit Card","Medical","Local Emergency","Other"]],["phone","Phone","tel"],["email","Email","email"],["country","Country","text"],["address","Address","text"],["link","Website","url"],["notes","Notes","textarea"]]}
};
function openModal(type){if(!activeTrip()){toast("Create a trip first");switchView("trips");return}modalType=type;const s=schemas[type];$("#modalTitle").textContent=s.title;$("#modalFields").innerHTML=s.fields.map(([n,l,t,o])=>`<label class="${t==="textarea"?"wide":""}">${l}${t==="select"?`<select name="${n}">${o.map(q=>`<option>${q}</option>`).join("")}</select>`:t==="timezone"?`<select name="${n}">${tzOptions}</select>`:t==="textarea"?`<textarea name="${n}"></textarea>`:`<input name="${n}" type="${t}" ${t==="number"?'step="0.01" min="0"':""}>`}</label>`).join("");$("#modal").showModal()}
$("#modalForm").addEventListener("submit",e=>{e.preventDefault();const s=schemas[modalType],o=Object.fromEntries(new FormData(e.currentTarget).entries());o.id=uid();o.tripId=state.activeTripId;["cost","estimated","actual","quantity"].forEach(k=>{if(k in o)o[k]=Number(o[k]||0)});if(["tasks","packing"].includes(s.target))o.done=false;state.records[s.target].push(o);$("#modal").close();save()});
function removeRecord(type,id){state.records[type]=state.records[type].filter(x=>x.id!==id);save()}
function toggleRecord(type,id){const x=state.records[type].find(x=>x.id===id);if(x)x.done=!x.done;save()}
window.removeRecord=removeRecord;window.toggleRecord=toggleRecord;

async function refreshRate(){
 const t=activeTrip();if(!t?.currency){rate=null;renderCurrency();return}
 if(t.currency==="USD"){rate=1;renderCurrency();return}
 try{const r=await fetch(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${t.currency}`);const d=await r.json();rate=d.rates?.[t.currency]||null;renderCurrency()}
 catch{toast("Could not refresh currency")}
}
$("#quickUsd").addEventListener("input",renderCurrency);
function renderCurrency(){const t=activeTrip(),amt=Number($("#quickUsd").value||0);$("#rateDisplay").textContent=rate?`${rate.toLocaleString()} ${t?.currency}`:"—";$("#quickLocal").textContent=rate?`${t?.symbol||t?.currency} ${(amt*rate).toLocaleString(undefined,{maximumFractionDigits:2})}`:"—";$("#rateUpdated").textContent=rate?"Daily planning rate. Bank rates may differ.":"Choose a destination country."}

function renderAll(){renderTripSelect();renderDashboard();renderTrips();renderItinerary();renderReservations();renderBudget();renderChecks("tasks","#taskList");renderChecks("packing","#packingList");renderDocuments();renderPlaces();renderContacts()}
function renderTripSelect(){const s=$("#activeTripSelect");s.innerHTML=state.trips.length?state.trips.map(t=>`<option value="${t.id}" ${t.id===state.activeTripId?"selected":""}>${esc(t.name)}</option>`).join(""):'<option>No trips</option>';s.disabled=!state.trips.length}
$("#activeTripSelect").addEventListener("change",e=>{state.activeTripId=e.target.value;save();refreshRate()});

function renderDashboard(){
 const t=activeTrip(),ex=records("expenses"),spent=ex.reduce((a,x)=>a+Number(x.actual||0),0),remain=Number(t?.budget||0)-spent,used=t?.budget?Math.round(spent/t.budget*100):0;
 $("#dashTripName").textContent=t?.name||"Create your first trip";$("#dashTripMeta").textContent=t?[t.city,t.country,t.startDate&&t.endDate?`${t.startDate} to ${t.endDate}`:""].filter(Boolean).join(" · "):"Everything you need in one place.";
 const d=daysTo(t?.startDate);$("#daysUntil").textContent=d===null?"—":Math.max(0,d);$("#budgetRemaining").textContent=money(remain);$("#budgetPercent").textContent=`${used}% used`;
 const tasks=records("tasks"),pack=records("packing");$("#checklistProgress").textContent=progress(tasks)+"%";$("#checklistCount").textContent=`${tasks.length} tasks`;$("#packingProgress").textContent=progress(pack)+"%";$("#packingCount").textContent=`${pack.length} items`;$("#reservationCount").textContent=records("reservations").filter(x=>x.status==="Confirmed").length;
 const next=records("itinerary").filter(x=>x.date&&new Date(x.date+"T23:59")>=new Date()).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start)).slice(0,4);$("#nextItinerary").innerHTML=next.length?next.map(x=>`<div class="pill"><strong>${esc(x.date)} ${esc(x.start)}</strong> · ${esc(x.title)}</div>`).join(""):"<span class='muted'>No upcoming plans.</span>";
 $("#homeTime").textContent=nowInZone(t?.homeTimezone);$("#destinationTime").textContent=nowInZone(t?.destinationTimezone);
 const attention=[];const docs=records("documents");if(docs.filter(x=>x.expiration&&daysTo(x.expiration)<=180&&daysTo(x.expiration)>=0).length)attention.push("A document expires within 6 months");if(tasks.filter(x=>!x.done&&x.due&&daysTo(x.due)<0).length)attention.push("You have overdue tasks");if(records("reservations").filter(x=>x.payment!=="Paid"&&x.status!=="Cancelled").length)attention.push("A reservation payment is outstanding");$("#attentionList").innerHTML=attention.length?attention.map(x=>`<div class="pill warn">${x}</div>`).join(""):"<span class='muted'>Nothing urgent.</span>";
 renderCurrency()
}
function renderTrips(){const el=$("#tripList");el.innerHTML=state.trips.length?state.trips.map(t=>`<article class="item-card ${t.id===state.activeTripId?"active-trip":""}"><div><h3>${esc(t.name)}</h3><div class="meta"><span class="pill">${esc(t.status)}</span><span>${esc([t.city,t.country].filter(Boolean).join(", "))}</span><span>${esc(t.startDate||"No dates")}</span><span>${money(t.budget)}</span></div><p>${esc(t.notes||"")}</p></div><div class="item-actions"><button onclick="setActiveTrip('${t.id}')">${t.id===state.activeTripId?"Active":"Open"}</button><button class="icon-btn" onclick="openTripEditor('${t.id}')">Edit</button><button class="icon-btn" onclick="deleteTrip('${t.id}')">Delete</button></div></article>`).join(""):"<div class='card muted'>No trips yet.</div>"}
function renderItinerary(){const a=records("itinerary").sort((x,y)=>(x.date+x.start).localeCompare(y.date+y.start)),el=$("#itineraryList");if(!a.length){el.innerHTML="<div class='card muted'>No itinerary plans yet.</div>";return}const g={};a.forEach(x=>(g[x.date||"Unscheduled"]??=[]).push(x));el.innerHTML=Object.entries(g).map(([d,arr])=>`<section class="day-group"><h3>${d}</h3>${arr.map(x=>`<article class="timeline-item"><div class="timeline-time">${esc(x.start||"Any time")}${x.end?`<small>${esc(x.end)}</small>`:""}${x.timezone?`<small>${esc(x.timezone)}</small>`:""}</div><div><h4>${esc(x.title)}</h4><div class="meta"><span class="pill">${esc(x.type)}</span><span>${esc(x.status)}</span>${x.cost?`<span>${money(x.cost)}</span>`:""}</div>${x.address?`<p>${esc(x.address)}</p>`:""}${x.notes?`<p>${esc(x.notes)}</p>`:""}</div><div class="item-actions">${x.address?`<a class="button icon-btn" target="_blank" href="${mapLink(x.address)}">Map</a>`:""}${x.link?`<a class="button icon-btn" target="_blank" href="${esc(x.link)}">Open</a>`:""}<button class="icon-btn" onclick="removeRecord('itinerary','${x.id}')">Delete</button></div></article>`).join("")}</section>`).join("")}
function genericCards(type,id){const a=records(type),el=$(id);el.innerHTML=a.length?a.map(x=>`<article class="item-card"><div><h3>${esc(x.title||x.name||x.type)}</h3><div class="meta">${[x.type,x.status,x.city,x.country,x.start,x.expiration].filter(Boolean).map(v=>`<span class="pill">${esc(v)}</span>`).join("")}</div>${x.confirmation?`<p>Confirmation: ${esc(x.confirmation)}</p>`:""}${x.reference?`<p>Reference: ${esc(x.reference)}</p>`:""}${x.notes?`<p>${esc(x.notes)}</p>`:""}</div><div class="item-actions">${x.address?`<a class="button icon-btn" target="_blank" href="${mapLink(x.address)}">Map</a>`:""}${x.link?`<a class="button icon-btn" target="_blank" href="${esc(x.link)}">Open</a>`:""}${x.phone?`<a class="button icon-btn" href="tel:${esc(x.phone)}">Call</a>`:""}<button class="icon-btn" onclick="removeRecord('${type}','${x.id}')">Delete</button></div></article>`).join(""):`<div class="card muted">No ${type} yet.</div>`}
function renderReservations(){genericCards("reservations","#reservationList")}function renderDocuments(){genericCards("documents","#documentList")}function renderPlaces(){genericCards("places","#placeList")}function renderContacts(){genericCards("contacts","#contactList")}
function renderBudget(){const t=activeTrip(),a=records("expenses"),est=a.reduce((s,x)=>s+Number(x.estimated||0),0),spent=a.reduce((s,x)=>s+Number(x.actual||0),0),remain=Number(t?.budget||0)-spent;$("#budgetTotal").textContent=money(t?.budget);$("#budgetEstimated").textContent=money(est);$("#budgetSpent").textContent=money(spent);$("#budgetRemain2").textContent=money(remain);$("#expenseList").innerHTML=a.length?`<table class="data-table"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Estimated</th><th>Actual</th><th>Status</th><th></th></tr></thead><tbody>${a.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.category)}</td><td>${esc(x.description)}</td><td>${money(x.estimated)}</td><td>${money(x.actual)}</td><td>${esc(x.payment)}</td><td><button class="icon-btn" onclick="removeRecord('expenses','${x.id}')">×</button></td></tr>`).join("")}</tbody></table>`:"<div class='muted'>No budget items yet.</div>"}
function renderChecks(type,id){const a=records(type),el=$(id);el.innerHTML=a.length?a.map(x=>`<div class="check-row ${x.done?"done":""}"><input type="checkbox" ${x.done?"checked":""} onchange="toggleRecord('${type}','${x.id}')"><div class="check-text"><strong>${esc(x.name)}</strong><div class="meta"><span>${esc(x.category)}</span>${x.due?`<span>Due ${esc(x.due)}</span>`:""}${x.quantity?`<span>Qty ${esc(x.quantity)}</span>`:""}${x.bag?`<span>${esc(x.bag)}</span>`:""}</div></div><button class="icon-btn" onclick="removeRecord('${type}','${x.id}')">×</button></div>`).join(""):"<div class='muted' style='padding:14px'>Nothing added yet.</div>"}
