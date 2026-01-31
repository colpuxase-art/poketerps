(() => {
  const tg = window.Telegram?.WebApp;
  if (tg) { try { tg.ready(); tg.expand(); } catch {} }
  const tgUserId = tg?.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : null;

  const $ = (id) => document.getElementById(id);
  const safeStr = (v) => (v == null ? "" : String(v));
  const norm = (v) => safeStr(v).trim().toLowerCase();

  const typeLabel = (t) => ({ hash: "Hash", weed: "Weed", extraction: "Extraction", wpff: "WPFF" }[t] || t);
  const weedKindLabel = (k) => ({ indica: "Indica", sativa: "Sativa", hybrid: "Hybrid" }[k] || k);
  const formatList = (arr) => (Array.isArray(arr) && arr.length ? arr.join(", ") : "—");
  const cardDesc = (c) => c.description ?? c.desc ?? c.profile ?? "—";

  function toast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.style.display = "none"), 1400);
  }
  function haptic(style = "light") { try { tg?.HapticFeedback?.impactOccurred?.(style); } catch {} }

  function parseThcScore(thcText) {
    const s = safeStr(thcText);
    const nums = (s.match(/\d+(\.\d+)?/g) || []).map(Number).filter((n) => !Number.isNaN(n));
    if (!nums.length) return 0;
    return Math.max(...nums);
  }
  function scrollToDetails() {
    const anchor = document.getElementById("detailsAnchor") || document.getElementById("pokeName");
    if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Elements (Home)
  const homeWrap = $("homeWrap");
  const allControls = $("allControls");
  const btnOpenAll = $("btnOpenAll");
  const btnBackHome = $("btnBackHome");

  const popularRow = $("popularRow");
  const trendingRow = $("trendingRow");
  const newestRow = $("newestRow");

  const btnShowAllPopular = $("btnShowAllPopular");
  const btnShowAllTrending = $("btnShowAllTrending");
  const btnShowAllNewest = $("btnShowAllNewest");

  // Featured + Partner
  const featuredBox = $("featuredBox");
  const featuredImg = $("featuredImg");
  const featuredTitle = $("featuredTitle");
  const featuredName = $("featuredName");
  const featuredMeta = $("featuredMeta");
  const featuredLine = $("featuredLine");
  const featuredViewBtn = $("featuredViewBtn");

  const partnerBox = $("partnerBox");
  const partnerImg = $("partnerImg");
  const partnerTitle = $("partnerTitle");
  const partnerName = $("partnerName");
  const partnerMeta = $("partnerMeta");
  const partnerLine = $("partnerLine");
  const partnerViewBtn = $("partnerViewBtn");

  // All list + details
  const listEl = $("list");
  const countBadge = $("countBadge");
  const favBadge = $("favBadge");
  const searchInput = $("searchInput");
  const clearBtn = $("clearBtn");
  const closeBtn = $("closeBtn");
  const randomBtn = $("randomBtn");
  const shareBtn = $("shareBtn");
  const themeBtn = $("themeBtn");
  const sortSelect = $("sortSelect");
  const farmSelect = $("farmSelect");
  const favToggle = $("favToggle");
  const favBtn = $("favBtn");
  const subChips = $("subChips");

  const pokeName = $("pokeName");
  const pokeId = $("pokeId");
  const pokeImg = $("pokeImg");
  const placeholder = $("placeholder");
  const pokeType = $("pokeType");
  const pokeThc = $("pokeThc");
  const pokeDesc = $("pokeDesc");

  // MyDex/Profile
  const myDexList = $("myDexList");
  const myDexEmpty = $("myDexEmpty");
  const profileUserId = $("profileUserId");
  const profileFavCount = $("profileFavCount");

  // State
  let pokedex = [];
  let featured = null;
  let partner = null;
  let home = { popular: [], trending: [], newest: [] };

  let subcategories = [];
  let farms = [];

  let activeType = "all";
  let activeSub = "all"; // all | indica/sativa/hybrid | subcategory_id
  let activeFarm = "all";

  let selected = null;
  let sortMode = "new";
  let showFavOnly = false;

  const LS = { fav: "harvestdex_favs_v3", theme: "harvestdex_theme_v3" };
  function loadFavsLocal() {
    try {
      const raw = localStorage.getItem(LS.fav);
      const arr = JSON.parse(raw || "[]");
      return new Set((Array.isArray(arr) ? arr : []).map(String));
    } catch { return new Set(); }
  }
  function saveFavsLocal(set) { try { localStorage.setItem(LS.fav, JSON.stringify([...set])); } catch {} }
  let favsLocal = loadFavsLocal();

  function isFavorited(cardId) { return favsLocal.has(String(cardId)); }

  async function apiToggleFav(cardId) {
    if (!tgUserId) return null;
    const res = await fetch("/api/favorite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: Number(tgUserId), card_id: Number(cardId) }),
    });
    if (!res.ok) throw new Error("favorite http " + res.status);
    return await res.json();
  }

  async function apiLoadMyDexCards() {
    if (!tgUserId) return [];
    const res = await fetch("/api/mydex/" + encodeURIComponent(tgUserId), { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async function loadSubcategories() {
    try {
      const res = await fetch("/api/subcategories", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      subcategories = await res.json();
      if (!Array.isArray(subcategories)) subcategories = [];
    } catch { subcategories = []; }
  }

  async function loadFarms() {
    try {
      const res = await fetch("/api/farms", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      farms = await res.json();
      if (!Array.isArray(farms)) farms = [];
    } catch { farms = []; }

    if (farmSelect) {
      farmSelect.innerHTML = "";
      const optAll = document.createElement("option");
      optAll.value = "all";
      optAll.textContent = "🌾 Toutes les fermes";
      farmSelect.appendChild(optAll);

      farms.forEach((f) => {
        const o = document.createElement("option");
        o.value = String(f.id);
        o.textContent = f.name ? `🌾 ${f.name}` : `Farm #${f.id}`;
        farmSelect.appendChild(o);
      });

      farmSelect.value = String(activeFarm);
      farmSelect.onchange = () => {
        activeFarm = farmSelect.value || "all";
        renderList();
      };
    }
  }

  function mapCard(c) {
    return {
      id: Number(c.id) || c.id,
      name: c.name || "Sans nom",
      type: c.type || "hash",
      thc: c.thc || "—",
      description: c.description ?? c.desc ?? "—",
      img: c.img || c.image || "https://i.imgur.com/0HqWQvH.png",
      advice: c.advice || "Info éducative. Les effets varient selon la personne. Respecte la loi.",
      micron: c.micron ?? null,
      terpenes: Array.isArray(c.terpenes) ? c.terpenes : [],
      aroma: Array.isArray(c.aroma) ? c.aroma : [],
      effects: Array.isArray(c.effects) ? c.effects : [],
      weed_kind: c.weed_kind ?? null,
      subcategory_id: c.subcategory_id ?? null,
      subcategory: c.subcategory ?? null, // label
      farm_id: c.farm_id ?? null,
      farm: c.farm ?? null,
      is_featured: Boolean(c.is_featured),
      featured_title: c.featured_title || null,
      is_partner: Boolean(c.is_partner),
      partner_title: c.partner_title || null,
    };
  }

  async function loadCards() {
    try {
      const res = await fetch("/api/cards", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      pokedex = (Array.isArray(data) ? data : []).map(mapCard);
    } catch (e) {
      console.warn("⚠️ /api/cards KO", e);
      pokedex = [];
    }
  }

  async function loadHome() {
    try {
      const res = await fetch("/api/home?limit=8", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();

      featured = data.featured ? mapCard(data.featured) : null;
      partner = data.partner ? mapCard(data.partner) : null;

      home = {
        popular: (data.popular || []).map(mapCard),
        trending: (data.trending || []).map(mapCard),
        newest: (data.newest || []).map(mapCard),
      };
    } catch (e) {
      console.warn("⚠️ /api/home KO", e);
      home = { popular: [], trending: [], newest: [] };
      featured = null;
      partner = null;
    }
  }

  function applyThemeFromStorage() {
    const v = localStorage.getItem(LS.theme) || "normal";
    document.body.classList.toggle("shiny-mode", v === "shiny");
    if (themeBtn) themeBtn.textContent = v === "shiny" ? "✨ Shiny ON" : "✨ Shiny";
  }
  function toggleTheme() {
    const isShiny = document.body.classList.toggle("shiny-mode");
    localStorage.setItem(LS.theme, isShiny ? "shiny" : "normal");
    if (themeBtn) themeBtn.textContent = isShiny ? "✨ Shiny ON" : "✨ Shiny";
    toast(isShiny ? "✨ Mode Shiny activé" : "✨ Mode Shiny désactivé");
    haptic("medium");
  }

  function setFavUI(card) {
    if (!favBtn) return;
    if (!card) { favBtn.textContent = "❤️ Ajouter aux favoris"; return; }
    favBtn.textContent = isFavorited(card.id) ? "💔 Retirer des favoris" : "❤️ Ajouter aux favoris";
  }
  function updateBadges() {
    if (countBadge) countBadge.textContent = String(pokedex.length || 0);
    if (favBadge) favBadge.textContent = `❤️ ${favsLocal.size}`;
    if (profileFavCount) profileFavCount.textContent = String(favsLocal.size);
  }

  function showAllMode(filterPreset = null) {
    if (homeWrap) homeWrap.style.display = "none";
    if (allControls) allControls.style.display = "block";

    if (filterPreset === "popular" || filterPreset === "trending" || filterPreset === "newest") {
      // set sort for better feel
      sortMode = filterPreset === "newest" ? "new" : "new";
      if (sortSelect) sortSelect.value = sortMode;
    }
    renderSubChips();
    renderList();
  }
  function showHomeMode() {
    if (allControls) allControls.style.display = "none";
    if (homeWrap) homeWrap.style.display = "block";
  }

  function renderFeatured() {
    if (!featuredBox) return;
    if (!featured) { featuredBox.style.display = "none"; return; }
    featuredBox.style.display = "block";
    if (featuredImg) featuredImg.src = featured.img;
    if (featuredTitle) featuredTitle.textContent = featured.featured_title || "✨ Shiny du moment";
    if (featuredName) featuredName.textContent = featured.name;
    if (featuredMeta) {
      const parts = [typeLabel(featured.type)];
      if (norm(featured.type) === "weed" && featured.weed_kind) parts.push(weedKindLabel(norm(featured.weed_kind)));
      if (norm(featured.type) !== "weed" && featured.subcategory) parts.push(featured.subcategory);
      if (featured.micron) parts.push(featured.micron);
      if (featured.farm?.name) parts.push(`🌾 ${featured.farm.name}`);
      featuredMeta.textContent = parts.join(" • ");
    }
    if (featuredLine) featuredLine.textContent = `🧬 ${cardDesc(featured)}`;
    featuredViewBtn?.addEventListener("click", () => { selectCard(featured, true); toast("✨ Rare affichée"); });
  }

  function renderPartner() {
    if (!partnerBox) return;
    if (!partner) { partnerBox.style.display = "none"; return; }
    partnerBox.style.display = "block";
    if (partnerImg) partnerImg.src = partner.img;
    if (partnerTitle) partnerTitle.textContent = partner.partner_title || "🤝 Partenaire du moment";
    if (partnerName) partnerName.textContent = partner.name;
    if (partnerMeta) {
      const parts = [typeLabel(partner.type)];
      if (norm(partner.type) === "weed" && partner.weed_kind) parts.push(weedKindLabel(norm(partner.weed_kind)));
      if (norm(partner.type) !== "weed" && partner.subcategory) parts.push(partner.subcategory);
      if (partner.micron) parts.push(partner.micron);
      if (partner.farm?.name) parts.push(`🌾 ${partner.farm.name}`);
      partnerMeta.textContent = parts.join(" • ");
    }
    if (partnerLine) partnerLine.textContent = `🧬 ${cardDesc(partner)}`;
    partnerViewBtn?.addEventListener("click", () => { selectCard(partner, true); toast("🤝 Partenaire affiché"); });
  }

  function miniCardHTML(c) {
    const parts = [typeLabel(c.type)];
    if (norm(c.type) === "weed" && c.weed_kind) parts.push(weedKindLabel(norm(c.weed_kind)));
    if (norm(c.type) !== "weed" && c.subcategory) parts.push(c.subcategory);
    if (c.micron) parts.push(c.micron);
    return `
      <div class="mini-card" data-id="${c.id}">
        <div class="mini-top">
          <img class="mini-img" src="${c.img}" alt="">
          <div>
            <div class="mini-name">${safeStr(c.name)}</div>
            <div class="mini-meta">#${c.id} • ${parts.join(" • ")}</div>
          </div>
        </div>
      </div>
    `;
  }

  function bindMiniRow(rowEl, cards) {
    if (!rowEl) return;
    rowEl.innerHTML = "";
    if (!cards.length) {
      rowEl.innerHTML = `<div class="text-secondary small">Aucune donnée.</div>`;
      return;
    }
    rowEl.innerHTML = cards.map(miniCardHTML).join("");
    rowEl.querySelectorAll(".mini-card").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-id");
        const c = pokedex.find((x) => String(x.id) === String(id)) || cards.find((x) => String(x.id) === String(id));
        if (c) selectCard(c, true);
      });
    });
  }

  function renderHomeSections() {
    renderFeatured();
    renderPartner();
    bindMiniRow(popularRow, home.popular || []);
    bindMiniRow(trendingRow, home.trending || []);
    bindMiniRow(newestRow, home.newest || []);
  }

  // Chips
  function chipBtn(label, value, active = false) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `btn btn-sm ${active ? "btn-danger" : "btn-outline-light"}`;
    btn.textContent = label;
    btn.dataset.sub = value;
    btn.style.borderRadius = "999px";
    return btn;
  }

  function renderSubChips() {
    if (!subChips) return;
    subChips.innerHTML = "";

    if (activeType === "all") {
      activeSub = "all";
      subChips.style.display = "none";
      return;
    }
    subChips.style.display = "flex";

    let options = [{ label: "Tous", value: "all" }];

    if (activeType === "weed") {
      options = options.concat([
        { label: "Indica", value: "indica" },
        { label: "Sativa", value: "sativa" },
        { label: "Hybrid", value: "hybrid" },
      ]);
      if (activeSub !== "all" && !["indica", "sativa", "hybrid"].includes(activeSub)) activeSub = "all";
    } else {
      const subs = (subcategories || [])
        .filter((s) => norm(s.type) === activeType)
        .sort((a, b) => (a.sort || 0) - (b.sort || 0))
        .map((s) => ({ label: s.label, value: String(s.id) }));
      options = options.concat(subs);
      if (activeSub !== "all" && !subs.some((s) => s.value === String(activeSub))) activeSub = "all";
    }

    options.forEach((opt) => {
      const btn = chipBtn(opt.label, opt.value, String(activeSub) === String(opt.value));
      btn.addEventListener("click", () => {
        activeSub = opt.value;
        renderSubChips();
        renderList();
        haptic("light");
      });
      subChips.appendChild(btn);
    });
  }

  function matchesFilters(card) {
    const q = norm(searchInput?.value || "");
    const t = norm(card.type);

    if (activeType !== "all" && t !== activeType) return false;

    // farm filter
    if (activeFarm !== "all") {
      if (String(card.farm_id || "") !== String(activeFarm)) return false;
    }

    // sub filter
    if (activeType === "weed") {
      if (activeSub !== "all" && norm(card.weed_kind) !== activeSub) return false;
    } else if (activeType !== "all") {
      if (activeSub !== "all" && String(card.subcategory_id || "") !== String(activeSub)) return false;
    }

    if (showFavOnly && !isFavorited(card.id)) return false;

    if (!q) return true;

    const bag = [
      card.name,
      cardDesc(card),
      card.thc,
      ...(card.terpenes || []),
      ...(card.aroma || []),
      ...(card.effects || []),
      card.advice,
      card.subcategory || "",
      card.farm?.name || "",
    ].map(norm).join(" ");

    return bag.includes(q);
  }

  function sortCards(arr) {
    const copy = [...arr];
    if (sortMode === "az") return copy.sort((a, b) => safeStr(a.name).localeCompare(safeStr(b.name)));
    if (sortMode === "thc") return copy.sort((a, b) => parseThcScore(b.thc) - parseThcScore(a.thc));
    return copy.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
  }

  function renderList() {
    if (!listEl) return;
    const items = sortCards(pokedex.filter(matchesFilters));

    listEl.innerHTML = "";
    updateBadges();

    if (!items.length) {
      listEl.innerHTML = `<div class="text-secondary mt-2">Aucune fiche trouvée.</div>`;
      return;
    }

    items.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "list-group-item list-group-item-action bg-black text-white border-secondary";
      btn.style.borderRadius = "14px";
      btn.style.marginBottom = "8px";

      const metaParts = [typeLabel(c.type)];
      if (norm(c.type) === "weed" && c.weed_kind) metaParts.push(weedKindLabel(norm(c.weed_kind)));
      if (norm(c.type) !== "weed" && c.subcategory) metaParts.push(c.subcategory);
      if (c.micron) metaParts.push(c.micron);
      if (c.farm?.name) metaParts.push(`🌾 ${c.farm.name}`);

      btn.innerHTML = `
        <div class="d-flex align-items-center justify-content-between gap-2">
          <div class="d-flex align-items-center gap-2">
            <img src="${c.img}" alt="" width="42" height="42" style="border-radius:12px; object-fit:cover; border:1px solid rgba(255,255,255,.10);">
            <div>
              <div class="fw-bold">${safeStr(c.name)}</div>
              <div class="text-secondary small">#${c.id} • ${metaParts.join(" • ")}</div>
            </div>
          </div>
          <div class="text-warning">${isFavorited(c.id) ? "❤️" : ""}</div>
        </div>
      `;
      btn.addEventListener("click", () => selectCard(c, true));
      listEl.appendChild(btn);
    });
  }

  function selectCard(card, doScroll = false) {
    selected = card;

    if (pokeName) pokeName.textContent = safeStr(card.name);
    if (pokeId) pokeId.textContent = `#${card.id}`;

    if (pokeImg) { pokeImg.src = card.img; pokeImg.style.display = "block"; }
    if (placeholder) placeholder.style.display = "none";

    if (pokeType) {
      const parts = [typeLabel(card.type)];
      if (norm(card.type) === "weed" && card.weed_kind) parts.push(weedKindLabel(norm(card.weed_kind)));
      if (norm(card.type) !== "weed" && card.subcategory) parts.push(card.subcategory);
      if (card.micron) parts.push(card.micron);
      if (card.farm?.name) parts.push(`🌾 ${card.farm.name}`);
      pokeType.textContent = parts.join(" • ");
    }
    if (pokeThc) pokeThc.textContent = safeStr(card.thc || "—");

    const lines = [];
    lines.push(`🧬 ${cardDesc(card)}`);
    lines.push("");
    lines.push(`🌿 Terpènes: ${formatList(card.terpenes)}`);
    lines.push(`👃 Arômes: ${formatList(card.aroma)}`);
    lines.push(`🧠 Effets: ${formatList(card.effects)}`);
    lines.push("");
    lines.push(`⚠️ ${safeStr(card.advice)}`);

    if (pokeDesc) pokeDesc.textContent = lines.join("\n");

    setFavUI(card);
    updateBadges();
    if (doScroll) scrollToDetails();
  }

  async function loadMyDex() {
    if (!myDexList || !myDexEmpty) return;

    myDexList.innerHTML = "";
    myDexEmpty.style.display = "block";

    let cards = [];
    if (tgUserId) {
      try {
        const apiCards = await apiLoadMyDexCards();
        cards = (apiCards || []).map(mapCard);
        favsLocal = new Set(cards.map((x) => String(x.id)));
        saveFavsLocal(favsLocal);
        updateBadges();
      } catch {}
    } else {
      cards = pokedex.filter((c) => favsLocal.has(String(c.id)));
    }

    if (!cards.length) return;
    myDexEmpty.style.display = "none";

    cards.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "list-group-item list-group-item-action bg-black text-white border-secondary";
      btn.style.borderRadius = "14px";
      btn.style.marginBottom = "8px";
      btn.innerHTML = `
        <div class="d-flex align-items-center justify-content-between gap-2">
          <div class="d-flex align-items-center gap-2">
            <img src="${c.img}" alt="" width="42" height="42" style="border-radius:12px; object-fit:cover; border:1px solid rgba(255,255,255,.10);">
            <div>
              <div class="fw-bold">${safeStr(c.name)}</div>
              <div class="text-secondary small">#${c.id} • ${typeLabel(c.type)}</div>
            </div>
          </div>
          <div class="text-warning">❤️</div>
        </div>
      `;
      btn.addEventListener("click", () => {
        document.getElementById("btnNavDex")?.click?.();
        selectCard(c, true);
      });
      myDexList.appendChild(btn);
    });
  }

  function loadProfile() {
    if (profileUserId) profileUserId.textContent = tgUserId ? tgUserId : "—";
    if (profileFavCount) profileFavCount.textContent = String(favsLocal.size);
  }
  window.loadMyDex = loadMyDex;
  window.loadProfile = loadProfile;

  // Events
  document.querySelectorAll(".chip").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      activeType = b.dataset.type || "all";
      activeSub = "all";
      renderSubChips();
      renderList();
      haptic("light");
    });
  });

  searchInput?.addEventListener("input", () => renderList());
  clearBtn?.addEventListener("click", () => { if (searchInput) searchInput.value = ""; renderList(); haptic("light"); });

  sortSelect?.addEventListener("change", () => { sortMode = sortSelect.value || "new"; renderList(); haptic("light"); });

  favToggle?.addEventListener("click", () => {
    showFavOnly = !showFavOnly;
    favToggle.classList.toggle("active", showFavOnly);
    favToggle.textContent = showFavOnly ? "❤️ Favoris ON" : "❤️ Favoris";
    renderList();
    haptic("light");
  });

  randomBtn?.addEventListener("click", () => {
    const items = pokedex.filter(matchesFilters);
    if (!items.length) return toast("Aucune fiche");
    const pick = items[Math.floor(Math.random() * items.length)];
    selectCard(pick, true);
    toast("🎲 Random !");
    haptic("medium");
  });

  shareBtn?.addEventListener("click", () => {
    if (!selected) return toast("Sélectionne une fiche");
    const text = `🧬 ${selected.name} (#${selected.id}) — ${typeLabel(selected.type)}\n${selected.thc}\n${cardDesc(selected)}`;
    try { tg?.shareText?.(text); }
    catch { navigator.clipboard?.writeText?.(text); toast("📋 Copié !"); }
  });

  closeBtn?.addEventListener("click", () => { try { tg?.close(); } catch {} });
  themeBtn?.addEventListener("click", toggleTheme);

  favBtn?.addEventListener("click", async () => {
    if (!selected) return toast("Sélectionne une fiche");
    const id = selected.id;

    if (tgUserId) {
      try {
        const out = await apiToggleFav(id);
        if (out?.favorited) favsLocal.add(String(id));
        else favsLocal.delete(String(id));
        saveFavsLocal(favsLocal);
        setFavUI(selected);
        updateBadges();
        toast(out?.favorited ? "❤️ Ajouté au Dex" : "💔 Retiré du Dex");
        haptic("medium");
        return;
      } catch {}
    }

    const key = String(id);
    if (favsLocal.has(key)) favsLocal.delete(key);
    else favsLocal.add(key);
    saveFavsLocal(favsLocal);
    setFavUI(selected);
    updateBadges();
    toast(favsLocal.has(key) ? "❤️ Ajouté (local)" : "💔 Retiré (local)");
    haptic("medium");
  });

  btnOpenAll?.addEventListener("click", () => showAllMode());
  btnBackHome?.addEventListener("click", () => showHomeMode());
  btnShowAllPopular?.addEventListener("click", () => showAllMode("popular"));
  btnShowAllTrending?.addEventListener("click", () => showAllMode("trending"));
  btnShowAllNewest?.addEventListener("click", () => showAllMode("newest"));

  async function init() {
    applyThemeFromStorage();

    await Promise.all([loadSubcategories(), loadFarms(), loadCards(), loadHome()]);
    renderHomeSections();

    // preselect first from pokedex
    if (pokedex.length) selectCard(pokedex[0], false);
    loadProfile();
    updateBadges();

    // hash routes
    const h = (window.location.hash || "").toLowerCase();
    if (h === "#mydex") document.getElementById("btnNavMyDex")?.click?.();
    else if (h === "#profile") document.getElementById("btnNavProfile")?.click?.();
  }

  init();
})();