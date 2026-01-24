
const tg = window.Telegram?.WebApp;
tg?.ready();

let cards=[], subs={}, favorites=new Set();
const list=document.getElementById("list");
const profile=document.getElementById("profile");
const profileInfo=document.getElementById("profile-info");

document.getElementById("tab-dex").onclick=()=>renderDex();
document.getElementById("tab-mydex").onclick=()=>renderMyDex();
document.getElementById("tab-profile").onclick=()=>renderProfile();

async function init(){
  const c=await fetch("/api/cards").then(r=>r.json());
  const s=await fetch("/api/subcategories").then(r=>r.json());
  cards=c;
  s.forEach(x=>subs[x.id]=x.label);
  if(tg?.initDataUnsafe?.user){
    const uid=tg.initDataUnsafe.user.id;
    const fav=await fetch("/api/mydex/"+uid).then(r=>r.json());
    fav.forEach(c=>favorites.add(String(c.id)));
  }
  renderDex();
}
init();

function renderDex(){
  profile.classList.add("hidden");
  list.innerHTML="";
  cards.forEach(c=>{
    const d=document.createElement("div");
    d.innerHTML=`<b>${c.name}</b><br>${subs[c.subcategory_id]||""}`;
    d.onclick=()=>openDetail(c);
    list.appendChild(d);
  });
}
function renderMyDex(){
  profile.classList.add("hidden");
  list.innerHTML="";
  cards.filter(c=>favorites.has(String(c.id))).forEach(c=>{
    const d=document.createElement("div");
    d.textContent=c.name;
    d.onclick=()=>openDetail(c);
    list.appendChild(d);
  });
}
function renderProfile(){
  list.innerHTML="";
  profile.classList.remove("hidden");
  if(tg?.initDataUnsafe?.user){
    profileInfo.textContent=
      "Utilisateur: "+tg.initDataUnsafe.user.first_name+
      " — Fiches collectées: "+favorites.size;
  }
}

function openDetail(c){
  const d=document.getElementById("detail");
  d.classList.remove("hidden");
  d.innerHTML=`<h2>${c.name}</h2><p>${c.description||""}</p>`;
  d.scrollIntoView({behavior:"smooth"});
}
