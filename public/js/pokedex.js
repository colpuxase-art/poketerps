(() => {
  const tg = window.Telegram?.WebApp;
  if (tg) { tg.ready(); tg.expand(); }

  const $ = (id) => document.getElementById(id);

  // Existing DOM
  const listEl = $("list");
  const listSkeleton = $("listSkeleton");
  const subChips = $("subChips");
  const searchInput = $("searchInput");
  const clearBtn = $("clearBtn");
  const favToggle = $("favToggle");
  const randomBtn = $("randomBtn");

  // Details DOM
  const pokeName = $("pokeName");
  const pokeId = $("pokeId");
  const pokeImg = $("pokeImg");
  const placeholder = $("placeholder");
  const pokeType = $("pokeType");
  const pokeThc = $("pokeThc");
  const pokeDesc = $("pokeDesc");
  const favBtn = $("favBtn");
  const shareBtn = $("shareBtn");

  // Bottom bar
  const navDex = $("navDex");
  const navMyDex = $("navMyDex");
  const navProfile = $("navProfile");
  const profileModal = $("profileModal");
  const closeProfile = $("closeProfile");
  const profileBody = $("profileBody");

  const DEFAULT_CARD_IMG = "https://i.postimg.cc/02m6qP8p/harvestdex-card-placeholder.jpg";

  let cards = [];
  let subs = [];
  let subsByType = { hash:[], weed:[], extraction:[], wpff:[] };
  let subsLabel = {};
  let selectedType = "hash";
  let selectedSubId = null;
  let favorites = new Set();
  let view = "dex"; // dex | mydex

  const uid = tg?.initDataUnsafe?.user?.id || null;

  // Init
  bind();
  boot();

  function bind(){
    // type chips already in HTML: .chip[data-type]
    document.querySelectorAll(".chip[data-type]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        selectedType = btn.dataset.type;
        selectedSubId = null;
        // active state
        document.querySelectorAll(".chip[data-type]").forEach(x=>x.classList.remove("active"));
        btn.classList.add("active");
        renderSubcats();
        render();
      });
    });

    searchInput?.addEventListener("input", render);
    clearBtn?.addEventListener("click", ()=>{
      if (searchInput) searchInput.value = "";
      render();
    });

    favToggle?.addEventListener("change", ()=>{
      view = favToggle.checked ? "mydex" : "dex";
      syncBottom();
      render();
    });

    randomBtn?.addEventListener("click", ()=>{
      const pool = getFiltered();
      if (!pool.length) return toast("Aucune carte.");
      openCard(pool[Math.floor(Math.random()*pool.length)]);
    });

    // bottom bar
    navDex?.addEventListener("click", ()=>{
      view = "dex";
      if (favToggle) favToggle.checked = false;
      syncBottom(); render();
    });
    navMyDex?.addEventListener("click", ()=>{
      view = "mydex";
      if (favToggle) favToggle.checked = true;
      syncBottom(); render();
    });
    navProfile?.addEventListener("click", ()=>openProfile());
    closeProfile?.addEventListener("click", ()=>closeProfileModal());
    profileModal?.addEventListener("click", (e)=>{ if(e.target === profileModal) closeProfileModal(); });

    favBtn?.addEventListener("click", ()=>toggleFavCurrent());
    shareBtn?.addEventListener("click", ()=>shareCurrent());
  }

  async function boot(){
    try{
      showListLoading(true);
      await Promise.all([loadCards(), loadSubcats(), loadFavorites()]);
      renderSubcats();
      syncBottom();
      render();
    }catch(e){
      console.error(e);
      toast("Erreur chargement. Vérifie /api/cards.");
    }finally{
      showListLoading(false);
    }
  }

  async function loadCards(){
    const res = await fetch(`${window.location.origin}/api/cards`, { cache: "no-store" });
    if(!res.ok) throw new Error("api cards failed "+res.status);
    cards = await res.json();
  }

  async function loadSubcats(){
    const res = await fetch(`${window.location.origin}/api/subcategories`, { cache:"no-store" });
    if(!res.ok){ subs=[]; return; }
    subs = await res.json();
    subsLabel = {};
    subsByType = { hash:[], weed:[], extraction:[], wpff:[] };
    subs.forEach(s=>{
      subsLabel[String(s.id)] = s.label;
      if(subsByType[s.type]) subsByType[s.type].push(s);
    });
    // sort
    Object.keys(subsByType).forEach(t=>{
      subsByType[t].sort((a,b)=>(a.sort??100)-(b.sort??100));
    });
  }

  async function loadFavorites(){
    favorites = new Set();
    if(!uid) return;
    const res = await fetch(`${window.location.origin}/api/mydex/${uid}`, { cache:"no-store" });
    if(!res.ok) return;
    const favCards = await res.json();
    (favCards||[]).forEach(c=>favorites.add(String(c.id)));
  }

  function renderSubcats(){
    if(!subChips) return;
    const list = subsByType[selectedType] || [];
    subChips.innerHTML = "";
    if(!list.length){
      subChips.innerHTML = `<div class="text-muted small mt-2">Aucune sous-catégorie</div>`;
      return;
    }
    const wrap = document.createElement("div");
    wrap.className = "d-flex flex-wrap gap-2 mt-2";
    // "All"
    const all = mkSubChip("Toutes", null);
    wrap.appendChild(all);

    list.forEach(s=>{
      wrap.appendChild(mkSubChip(s.label, String(s.id)));
    });
    subChips.appendChild(wrap);
  }

  function mkSubChip(label, subId){
    const b=document.createElement("button");
    b.className="btn btn-sm btn-outline-light chip";
    b.textContent=label;
    if(subId===null) b.classList.add("active");
    b.addEventListener("click", ()=>{
      // reset active
      b.parentElement.querySelectorAll("button").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      selectedSubId = subId;
      render();
    });
    return b;
  }

  function getFiltered(){
    const q=(searchInput?.value||"").trim().toLowerCase();
    return cards.filter(c=>{
      if(c.type !== selectedType) return false;
      if(view==="mydex" && !favorites.has(String(c.id))) return false;
      if(selectedSubId && String(c.subcategory_id||"") !== String(selectedSubId)) return false;
      if(q){
        const hay = `${c.name||""} ${c.description||""} ${(c.terpenes||[]).join(" ")} ${(c.aroma||[]).join(" ")} ${(c.effects||[]).join(" ")}`.toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function render(){
    if(!listEl) return;
    listEl.innerHTML = "";
    const items = getFiltered();

    if(!items.length){
      listEl.innerHTML = `<div class="text-muted mt-3">Aucune carte.</div>`;
      return;
    }

    items.forEach(c=>{
      const row=document.createElement("div");
      row.className="dex-row";
      const sub = c.subcategory_id ? (subsLabel[String(c.subcategory_id)] || "") : "";
      const fav = favorites.has(String(c.id)) ? "⭐" : "";
      row.innerHTML = `
        <div class="dex-left">
          <div class="dex-title">${escapeHtml(c.name||"")}</div>
          <div class="dex-meta">${escapeHtml(sub)} ${fav}</div>
        </div>
        <div class="dex-right">${escapeHtml(String(c.rarity||"COMMON"))}</div>
      `;
      row.addEventListener("click", ()=>openCard(c));
      listEl.appendChild(row);
    });
  }

  let currentCard = null;
  function openCard(c){
    currentCard = c;

    // Fill details area (existing HTML)
    if(pokeName) pokeName.textContent = c.name || "—";
    if(pokeId) pokeId.textContent = `#${c.id}`;
    if(pokeType) pokeType.textContent = (c.type||"").toUpperCase();
    if(pokeThc) pokeThc.textContent = c.thc || "—";
    if(pokeDesc) pokeDesc.textContent = c.description || "—";

    const img = c.img || DEFAULT_CARD_IMG;
    if(pokeImg){ pokeImg.src = img; pokeImg.style.display="block"; }
    if(placeholder) placeholder.style.display="none";

    // fav button state
    if(favBtn){
      favBtn.textContent = favorites.has(String(c.id)) ? "💔 Retirer de Mon Dex" : "⭐ Ajouter à Mon Dex";
    }

    // Auto-scroll to description (requested)
    setTimeout(()=>{ pokeDesc?.scrollIntoView({behavior:"smooth", block:"start"}); }, 50);
  }

  async function toggleFavCurrent(){
    if(!currentCard) return;
    if(!uid){
      // local fallback
      const k="harvestdex_favs";
      const s = new Set(JSON.parse(localStorage.getItem(k)||"[]").map(String));
      const id = String(currentCard.id);
      if(s.has(id)) s.delete(id); else s.add(id);
      localStorage.setItem(k, JSON.stringify(Array.from(s)));
      favorites = s;
      if(favBtn) favBtn.textContent = favorites.has(String(currentCard.id)) ? "💔 Retirer de Mon Dex" : "⭐ Ajouter à Mon Dex";
      render();
      return;
    }

    const res = await fetch(`${window.location.origin}/api/favorite`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ user_id: uid, card_id: currentCard.id })
    });
    const j = await res.json();
    if(j.favorited) favorites.add(String(currentCard.id));
    else favorites.delete(String(currentCard.id));

    if(favBtn) favBtn.textContent = j.favorited ? "💔 Retirer de Mon Dex" : "⭐ Ajouter à Mon Dex";
    render();
  }

  function shareCurrent(){
    if(!currentCard) return;
    tg?.sendData?.(JSON.stringify({ type:"share_card", card_id: currentCard.id }));
    toast("Envoyé au bot ✅");
  }

  function openProfile(){
    if(!profileModal) return;
    profileModal.style.display="flex";

    const name = tg?.initDataUnsafe?.user?.first_name || "Invité";
    const username = tg?.initDataUnsafe?.user?.username ? "@"+tg.initDataUnsafe.user.username : "";
    profileBody.innerHTML = `
      <div><b>${escapeHtml(name)}</b> <span class="text-muted">${escapeHtml(username)}</span></div>
      <div class="mt-2">⭐ Cartes dans Mon Dex : <b>${favorites.size}</b></div>
      <div class="mt-2 text-muted small">${uid ? "Synchronisé avec Telegram" : "Hors Telegram (local)"}</div>
    `;
  }
  function closeProfileModal(){
    if(profileModal) profileModal.style.display="none";
  }

  function syncBottom(){
    navDex?.classList.toggle("active", view==="dex");
    navMyDex?.classList.toggle("active", view==="mydex");
    // navProfile active not persistent
  }

  function showListLoading(on){
    if(!listSkeleton) return;
    listSkeleton.style.display = on ? "block" : "none";
  }

  let toastTimer=null;
  function toast(msg){
    const t=$("toast");
    if(!t) return;
    t.textContent = msg;
    t.style.display = msg ? "block" : "none";
    clearTimeout(toastTimer);
    if(msg){
      toastTimer=setTimeout(()=>{ t.style.display="none"; }, 2200);
    }
  }

  function escapeHtml(str){
    return String(str)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
})();