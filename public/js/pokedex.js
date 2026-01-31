
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
  const cardDesc = (c) => c.desc ?? c.description ?? c.profile ?? "—";

  function haptic(style = "light") { try { tg?.HapticFeedback?.impactOccurred?.(style); } catch {} }
  function toast(msg) {
    const t = $("toast"); if (!t) return;
    t.textContent = msg; t.style.display = "block";
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.style.display = "none"), 1400);
  }
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

  // Elements
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
  const pokeDescEl = $("pokeDesc");

  const featuredBox = $("featuredBox");
  const featuredImg = $("featuredImg");
  const featuredTitle = $("featuredTitle");
  const featuredName = $("featuredName");
  const featuredMeta = $("featuredMeta");
  const featuredLine = $("featuredLine");
  const featuredViewBtn = $("featuredViewBtn");
  const featuredCount = $("featuredCount");
  const sparklesWrap = $("sparkles");

  const partnerBox = $("partnerBox");
  const partnerImg = $("partnerImg");
  const partnerTitle = $("partnerTitle");
  const partnerName = $("partnerName");
  const partnerMeta = $("partnerMeta");
  const partnerLine = $("partnerLine");
  const partnerViewBtn = $("partnerViewBtn");

  // Sections elements
  const secPopular = $("secPopular");
  const secTrending = $("secTrending");
  const secNew = $("secNew");
  const rowPopular = $("rowPopular");
  const rowTrending = $("rowTrending");
  const rowNew = $("rowNew");
  const btnPopularAll = $("btnPopularAll");
  const btnTrendingAll = $("btnTrendingAll");
  const btnNewAll = $("btnNewAll");

  // MyDex/Profile
  const myDexList = $("myDexList");
  const myDexEmpty = $("myDexEmpty");
  const profileUserId = $("profileUserId");
  const profileFavCount = $("profileFavCount");

  if (!listEl || !countBadge || !searchInput) {
    console.error("❌ IDs HTML manquants (list/countBadge/searchInput).");
    return;
  }

  // State
  let pokedex = [];
  let featured = null;
  let subcategories = [];
  let farms = [];
  let activeFarm = "all";

  let activeType = "all";
  let activeSub = "all"; // all | indica/sativa/hybrid | subcategory_id (string)
  let selected = null;
  let sortMode = "new";
  let showFavOnly = false;

  const LS = { fav: "hd_favs_v1", theme: "hd_theme_v1" };

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

  // API
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
  async function apiTrackView(cardId) {
    try {
      await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: tgUserId ? Number(tgUserId) : null, card_id: Number(cardId), event_type: "view" }),
      });
    } catch {}
  }

  async function loadSubcategories() {
    try {
      const res = await fetch("/api/subcategories", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      subcategories = Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn("⚠️ /api/subcategories KO -> fallback");
      subcategories = [];
    }
  }

  async function loadFarms() {
    try {
      const res = await fetch("/api/farms", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      farms = Array.isArray(data) ? data : [];
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

  async function loadCards() {
    try {
      const res = await fetch("/api/cards", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      pokedex = (Array.isArray(data) ? data : []).map((c) => ({
        id: Number(c.id) || c.id,
        name: c.name || "Sans nom",
        type: c.type || "hash",
        micron: c.micron ?? null,
        weed_kind: c.weed_kind ?? null,
        thc: c.thc || "—",
        desc: cardDesc(c),
        img: c.img || "https://i.imgur.com/0HqWQvH.png",
        terpenes: Array.isArray(c.terpenes) ? c.terpenes : [],
        aroma: Array.isArray(c.aroma) ? c.aroma : [],
        effects: Array.isArray(c.effects) ? c.effects : [],
        advice: c.advice || "Info éducative. Les effets varient selon la personne. Respecte la loi.",
        subcategory_id: c.subcategory_id != null ? String(c.subcategory_id) : null,
        subcategory: c.subcategory || null,
        farm_id: c.farm_id != null ? String(c.farm_id) : null,
        farm: c.farm || null,
        is_partner: Boolean(c.is_partner),
        partner_title: c.partner_title || null,
        is_featured: Boolean(c.is_featured),
        featured_title: c.featured_title || null,
      }));
    } catch (e) {
      console.error("❌ /api/cards KO :", e);
      pokedex = [];
    }
  }

  async function loadFeatured() {
    try {
      const res = await fetch("/api/featured", { cache: "no-store" });
      const c = res.ok ? await res.json() : null;
      if (!c) { featured = null; if (featuredBox) featuredBox.style.display = "none"; return; }
      featured = {
        id: Number(c.id) || c.id,
        name: c.name || "Sans nom",
        type: c.type || "hash",
        micron: c.micron ?? null,
        weed_kind: c.weed_kind ?? null,
        thc: c.thc || "—",
        desc: cardDesc(c),
        img: c.img || "https://i.imgur.com/0HqWQvH.png",
        terpenes: Array.isArray(c.terpenes) ? c.terpenes : [],
        aroma: Array.isArray(c.aroma) ? c.aroma : [],
        effects: Array.isArray(c.effects) ? c.effects : [],
        advice: c.advice || "Info éducative. Les effets varient selon la personne. Respecte la loi.",
        featured_title: c.featured_title || "✨ Rare du moment",
        subcategory_id: c.subcategory_id != null ? String(c.subcategory_id) : null,
        subcategory: c.subcategory || null,
        farm: c.farm || null,
      };
      renderFeatured();
    } catch {
      featured = null;
      if (featuredBox) featuredBox.style.display = "none";
    }
  }

  async function loadPartner() {
    try {
      const res = await fetch("/api/partner", { cache: "no-store" });
      const c = res.ok ? await res.json() : null;
      if (!c) { if (partnerBox) partnerBox.style.display = "none"; return; }

      const partner = {
        id: Number(c.id) || c.id,
        name: c.name || "Sans nom",
        type: c.type || "hash",
        micron: c.micron ?? null,
        weed_kind: c.weed_kind ?? null,
        thc: c.thc || "—",
        desc: cardDesc(c),
        img: c.img || "https://i.imgur.com/0HqWQvH.png",
        partner_title: c.partner_title || "🤝 Partenaire du moment",
        subcategory_id: c.subcategory_id != null ? String(c.subcategory_id) : null,
        subcategory: c.subcategory || null,
        farm: c.farm || null,
      };

      if (partnerBox) partnerBox.style.display = "block";
      if (partnerImg) partnerImg.src = partner.img;
      if (partnerTitle) partnerTitle.textContent = partner.partner_title;
      if (partnerName) partnerName.textContent = partner.name;
      if (partnerMeta) {
        const parts = [typeLabel(partner.type)];
        if (norm(partner.type) === "weed" && partner.weed_kind) parts.push(weedKindLabel(norm(partner.weed_kind)));
        if (norm(partner.type) !== "weed" && partner.subcategory) parts.push(safeStr(partner.subcategory));
        if (partner.micron) parts.push(safeStr(partner.micron));
        if (partner.farm?.name) parts.push(`🌾 ${safeStr(partner.farm.name)}`);
        partnerMeta.textContent = parts.join(" • ");
      }
      if (partnerLine) partnerLine.textContent = `🧬 ${partner.desc || "—"}`;
      partnerViewBtn?.onclick = () => {
        selectCard(partner, true);
        toast("🤝 Partenaire affiché !");
        haptic("medium");
      };
    } catch {
      if (partnerBox) partnerBox.style.display = "none";
    }
  }

  // Sections
  function renderLegendRow(rowEl, cards, onAll) {
    if (!rowEl) return;
    rowEl.innerHTML = "";
    (cards || []).slice(0, 8).forEach((c) => {
      const d = document.createElement("div");
      d.className = "legend-item";
      d.innerHTML = `
        <img src="${c.img || "https://i.imgur.com/0HqWQvH.png"}" alt="">
        <div class="t1">${safeStr(c.name)}</div>
        <div class="t2">#${c.id} • ${typeLabel(c.type)}</div>
      `;
      d.onclick = () => { selectCard(mapCard(c), true); };
      rowEl.appendChild(d);
    });
  }

  function mapCard(c) {
    // make sure card conforms to local structure
    return {
      id: Number(c.id) || c.id,
      name: c.name || "Sans nom",
      type: c.type || "hash",
      micron: c.micron ?? null,
      weed_kind: c.weed_kind ?? null,
      thc: c.thc || "—",
      desc: cardDesc(c),
      img: c.img || "https://i.imgur.com/0HqWQvH.png",
      terpenes: Array.isArray(c.terpenes) ? c.terpenes : [],
      aroma: Array.isArray(c.aroma) ? c.aroma : [],
      effects: Array.isArray(c.effects) ? c.effects : [],
      advice: c.advice || "",
      subcategory_id: c.subcategory_id != null ? String(c.subcategory_id) : null,
      subcategory: c.subcategory || null,
      farm_id: c.farm_id != null ? String(c.farm_id) : null,
      farm: c.farm || null,
    };
  }

  async function loadSections() {
    // Popular
    try {
      const r = await fetch("/api/stats/popular?limit=8", { cache: "no-store" });
      const data = r.ok ? await r.json() : [];
      if (Array.isArray(data) && data.length) {
        if (secPopular) secPopular.style.display = "block";
        renderLegendRow(rowPopular, data);
      }
    } catch {}
    // Trending
    try {
      const r = await fetch("/api/stats/trending?days=7&limit=8", { cache: "no-store" });
      const data = r.ok ? await r.json() : [];
      if (Array.isArray(data) && data.length) {
        if (secTrending) secTrending.style.display = "block";
        renderLegendRow(rowTrending, data);
      }
    } catch {}
    // New
    try {
      const r = await fetch("/api/stats/new?limit=8", { cache: "no-store" });
      const data = r.ok ? await r.json() : [];
      if (Array.isArray(data) && data.length) {
        if (secNew) secNew.style.display = "block";
        renderLegendRow(rowNew, data);
      }
    } catch {}

    btnPopularAll?.addEventListener("click", () => {
      activeType = "all"; activeSub = "all"; showFavOnly = false; if (favToggle) { favToggle.classList.remove("active"); favToggle.textContent = "❤️ Favoris"; }
      document.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));
      document.querySelector('.chip[data-type="all"]')?.classList.add("active");
      renderSubChips(); renderList();
      toast("⭐ Populaire → Voir tous");
    });
    btnTrendingAll?.addEventListener("click", () => {
      activeType = "all"; activeSub = "all";
      document.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));
      document.querySelector('.chip[data-type="all"]')?.classList.add("active");
      renderSubChips(); renderList();
      toast("🔥 Tendance → Voir tous");
    });
    btnNewAll?.addEventListener("click", () => {
      sortMode = "new";
      if (sortSelect) sortSelect.value = "new";
      renderList();
      toast("🆕 Nouveautés → Voir tous");
    });
  }

  // Theme
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

  // Featured sparkles
  function makeSparkles() {
    if (!sparklesWrap) return;
    sparklesWrap.innerHTML = "";
    const spots = [
      { top: "14%", left: "10%", d: 0.0 },
      { top: "26%", left: "24%", d: 0.4 },
      { top: "12%", left: "52%", d: 0.2 },
      { top: "34%", left: "66%", d: 0.6 },
      { top: "16%", left: "86%", d: 0.1 },
      { top: "60%", left: "14%", d: 0.5 },
      { top: "72%", left: "46%", d: 0.3 },
      { top: "64%", left: "80%", d: 0.7 },
    ];
    spots.forEach((s) => {
      const el = document.createElement("div");
      el.className = "sparkle";
      el.style.top = s.top;
      el.style.left = s.left;
      el.style.animationDelay = `${s.d}s`;
      sparklesWrap.appendChild(el);
    });
  }

  function renderFeatured() {
    if (!featuredBox || !featured) return;
    featuredBox.style.display = "block";
    if (featuredImg) featuredImg.src = featured.img;
    if (featuredTitle) featuredTitle.textContent = featured.featured_title || "✨ Rare du moment";
    if (featuredName) featuredName.textContent = featured.name;
    if (featuredMeta) featuredMeta.textContent = `#${featured.id} • ${typeLabel(featured.type)}`;
    if (featuredLine) featuredLine.textContent = `🧬 ${cardDesc(featured)}`;
    try {
      const total = pokedex.length || 0;
      const pos = total ? (pokedex.findIndex((x) => String(x.id) === String(featured.id)) + 1) : 0;
      if (featuredCount && total) {
        featuredCount.style.display = "inline-block";
        featuredCount.textContent = `Rare #${pos || 1}/${total}`;
      }
    } catch {}
    makeSparkles();
    featuredViewBtn?.onclick = () => { selectCard(featured, true); toast("✨ Rare affiché !"); haptic("medium"); };
  }

  // Sub chips
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
      if (activeSub !== "all" && !["indica","sativa","hybrid"].includes(activeSub)) activeSub = "all";
    } else {
      const subs = (subcategories || [])
        .filter((s) => norm(s.type) === activeType)
        .sort((a, b) => (a.sort || 0) - (b.sort || 0))
        .map((s) => ({ label: s.label, value: String(s.id) }));
      options = options.concat(subs);
      if (activeSub !== "all" && !subs.some((s) => s.value === activeSub)) activeSub = "all";
    }

    options.forEach((opt) => {
      const btn = chipBtn(opt.label, opt.value, activeSub === opt.value);
      btn.addEventListener("click", () => {
        activeSub = opt.value;
        renderSubChips();
        renderList();
        haptic("light");
      });
      subChips.appendChild(btn);
    });
  }

  // Filters
  function matchesFilters(card) {
    const q = norm(searchInput?.value || "");
    const t = norm(card.type);

    if (activeType !== "all" && t !== activeType) return false;

    if (activeFarm !== "all") {
      if (String(card.farm_id || "") !== String(activeFarm)) return false;
    }

    if (activeType === "weed") {
      if (activeSub !== "all" && norm(card.weed_kind) !== activeSub) return false;
    } else {
      if (activeSub !== "all") {
        if (card.subcategory_id && String(card.subcategory_id) !== String(activeSub)) return false;
      }
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
    ].map(norm).join(" ");
    return bag.includes(q);
  }

  function sortCards(arr) {
    const copy = [...arr];
    if (sortMode === "az") { copy.sort((a, b) => safeStr(a.name).localeCompare(safeStr(b.name))); return copy; }
    if (sortMode === "thc") { copy.sort((a, b) => parseThcScore(b.thc) - parseThcScore(a.thc)); return copy; }
    copy.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    return copy;
  }

  function renderList() {
    const items = sortCards(pokedex.filter(matchesFilters));
    listEl.innerHTML = "";
    updateBadges();

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "text-secondary mt-2";
      empty.textContent = "Aucune fiche trouvée.";
      listEl.appendChild(empty);
      return;
    }

    items.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "list-group-item list-group-item-action bg-black text-white border-secondary";
      btn.style.borderRadius = "14px";
      btn.style.marginBottom = "8px";

      let metaExtra = "";
      if (norm(c.type) === "weed" && c.weed_kind) metaExtra = ` • ${weedKindLabel(norm(c.weed_kind))}`;
      else if (c.subcategory_id) {
        const found = (subcategories || []).find(x => String(x.id) === String(c.subcategory_id));
        if (found) metaExtra = ` • ${found.label}`;
      }
      if (c.farm?.name) metaExtra += ` • 🌾 ${safeStr(c.farm.name)}`;

      btn.innerHTML = `
        <div class="d-flex align-items-center justify-content-between gap-2">
          <div class="d-flex align-items-center gap-2">
            <img src="${c.img}" alt="" width="42" height="42" style="border-radius:12px; object-fit:cover; border:1px solid rgba(255,255,255,.10);">
            <div>
              <div class="fw-bold">${safeStr(c.name)}</div>
              <div class="text-secondary small">#${c.id} • ${typeLabel(c.type)}${metaExtra}</div>
            </div>
          </div>
          <div class="text-warning">${isFavorited(c.id) ? "❤️" : ""}</div>
        </div>
      `;

      btn.addEventListener("click", () => { selectCard(c, true); });
      listEl.appendChild(btn);
    });
  }

  async function selectCard(card, doScroll = false) {
    selected = card;

    if (pokeName) pokeName.textContent = safeStr(card.name);
    if (pokeId) pokeId.textContent = `#${card.id}`;

    if (pokeImg) { pokeImg.src = card.img || "https://i.imgur.com/0HqWQvH.png"; pokeImg.style.display = "block"; }
    if (placeholder) placeholder.style.display = "none";

    if (pokeType) {
      const t = norm(card.type);
      const parts = [typeLabel(card.type)];
      if (t === "weed" && card.weed_kind) parts.push(weedKindLabel(norm(card.weed_kind)));
      if (t !== "weed" && card.subcategory_id) {
        const found = (subcategories || []).find(x => String(x.id) === String(card.subcategory_id));
        if (found) parts.push(found.label);
      }
      if (t !== "weed" && card.micron) parts.push(safeStr(card.micron));
      if (card.farm?.name) parts.push(`🌾 ${safeStr(card.farm.name)}`);
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
    lines.push(`⚠️ ${safeStr(card.advice || "Info éducative. Les effets varient selon la personne. Respecte la loi.")}`);
    if (pokeDescEl) pokeDescEl.textContent = lines.join("\n");

    setFavUI(card);
    updateBadges();
    if (doScroll) scrollToDetails();

    // track view (non-bloquant)
    apiTrackView(card.id);
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
        favsLocal = new Set(cards.map(x => String(x.id)));
        saveFavsLocal(favsLocal);
        updateBadges();
      } catch {}
    } else {
      cards = pokedex.filter(c => favsLocal.has(String(c.id)));
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
      document.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      activeType = b.dataset.type || "all";
      activeSub = "all";
      renderSubChips();
      renderList();
      haptic("light");
    });
  });

  searchInput?.addEventListener("input", () => renderList());
  clearBtn?.addEventListener("click", () => { searchInput.value = ""; renderList(); haptic("light"); });

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

  async function init() {
    applyThemeFromStorage();

    await Promise.all([loadSubcategories(), loadFarms(), loadCards()]);
    await Promise.all([loadFeatured(), loadPartner(), loadSections()]);

    renderSubChips();
    renderList();

    if (pokedex.length) selectCard(pokedex[0], false);
    loadProfile();
    updateBadges();

    const h = (window.location.hash || "").toLowerCase();
    if (h === "#mydex") document.getElementById("btnNavMyDex")?.click?.();
    else if (h === "#profile") document.getElementById("btnNavProfile")?.click?.();
  }

  init();
})();
