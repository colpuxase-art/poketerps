(() => {
  /* ================= TELEGRAM ================= */
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  /* ================= TRACKING (NEW) ================= */
  function getSessionId() {
    const k = "poketerps_session_id_v1";
    let id = null;
    try {
      id = localStorage.getItem(k);
      if (!id) {
        id =
          (crypto?.randomUUID?.() ||
            `${Date.now()}_${Math.random().toString(16).slice(2)}`);
        localStorage.setItem(k, id);
      }
    } catch {
      id =
        (crypto?.randomUUID?.() ||
          `${Date.now()}_${Math.random().toString(16).slice(2)}`);
    }
    return id;
  }

  async function track(event, payload = {}) {
    try {
      await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: getSessionId(),
          event,
          ...payload,
        }),
      });
    } catch {
      // silencieux (pas bloquant)
    }
  }

  /* ================= FALLBACK (si API KO) ================= */
  const fallbackPokedex = [
    {
      id: 101,
      name: "Static Hash (exemple)",
      type: "hash",
      micron: "90u",
      weed_kind: null,
      thc: "THC: 35–55% (exemple)",
      desc: "Hash sec, texture sableuse, très parfumé.",
      img: "https://i.imgur.com/0HqWQvH.png",
      terpenes: ["Myrcene", "Caryophyllene"],
      aroma: ["Terreux", "Épicé", "Boisé"],
      effects: ["Relax (ressenti)", "Calme (ressenti)"],
      advice: "Commence bas. Évite de mélanger. Respecte la législation.",
    },
  ];

  /* ================= HELPERS ================= */
  const $ = (id) => document.getElementById(id);

  const typeLabel = (t) =>
    ({ hash: "Hash", weed: "Weed", extraction: "Extraction", wpff: "WPFF" }[t] ||
      t);
  const weedKindLabel = (k) =>
    ({ indica: "Indica", sativa: "Sativa", hybrid: "Hybrid" }[k] || k);
  const formatList = (arr) => (Array.isArray(arr) && arr.length ? arr.join(", ") : "—");

  const safeStr = (v) => (v == null ? "" : String(v));
  const norm = (v) => safeStr(v).trim().toLowerCase();

  function cardDesc(c) {
    return c.desc ?? c.description ?? c.profile ?? "—";
  }

  function parseThcNumber(thcText) {
    const s = safeStr(thcText);
    const nums = s.match(/(\d+([.,]\d+)?)/g);
    if (!nums || !nums.length) return -1;
    return Math.max(
      ...nums
        .map((x) => parseFloat(x.replace(",", ".")))
        .filter((n) => !Number.isNaN(n))
    );
  }

  function toast(msg) {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (el.style.display = "none"), 1600);
  }

  function scrollToDetails() {
    $("pokeName")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ================= STORAGE ================= */
  const LS_FAV = "poketerps_favs_v1";
  const LS_SHINY = "poketerps_shiny_mode_v1";
  const LS_FEATURED_VIEWS = "poketerps_featured_views_v1";

  function loadFavs() {
    try {
      const raw = localStorage.getItem(LS_FAV);
      const arr = JSON.parse(raw || "[]");
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch {
      return new Set();
    }
  }
  function saveFavs(set) {
    try {
      localStorage.setItem(LS_FAV, JSON.stringify([...set]));
    } catch {}
  }

  function getFeaturedViews(featuredId) {
    try {
      const raw = localStorage.getItem(LS_FEATURED_VIEWS);
      const obj = JSON.parse(raw || "{}");
      return Number(obj[String(featuredId)] || 0) || 0;
    } catch {
      return 0;
    }
  }
  function incFeaturedViews(featuredId) {
    try {
      const raw = localStorage.getItem(LS_FEATURED_VIEWS);
      const obj = JSON.parse(raw || "{}");
      const k = String(featuredId);
      obj[k] = (Number(obj[k] || 0) || 0) + 1;
      localStorage.setItem(LS_FEATURED_VIEWS, JSON.stringify(obj));
      return obj[k];
    } catch {
      return 0;
    }
  }

  /* ================= ELEMENTS ================= */
  const listEl = $("list");
  const countBadge = $("countBadge");
  const favBadge = $("favBadge");
  const searchInput = $("searchInput");
  const clearBtn = $("clearBtn");
  const closeBtn = $("closeBtn");
  const randomBtn = $("randomBtn");
  const shareBtn = $("shareBtn");

  const pokeName = $("pokeName");
  const pokeId = $("pokeId");
  const pokeImg = $("pokeImg");
  const placeholder = $("placeholder");
  const pokeType = $("pokeType");
  const pokeThc = $("pokeThc");
  const pokeDesc = $("pokeDesc");

  const themeBtn = $("themeBtn");

  // featured
  const featuredBox = $("featuredBox");
  const featuredImg = $("featuredImg");
  const featuredTitle = $("featuredTitle");
  const featuredName = $("featuredName");
  const featuredMeta = $("featuredMeta");
  const featuredLine = $("featuredLine");
  const featuredViewBtn = $("featuredViewBtn");
  const featuredCount = $("featuredCount");
  const sparkles = $("sparkles");

  // skeletons
  const listSkeleton = $("listSkeleton");
  const detailsSkeleton = $("detailsSkeleton");
  const detailsReal = $("detailsReal");

  // controls
  const sortSelect = $("sortSelect");
  const favToggle = $("favToggle");
  const favBtn = $("favBtn");

  // sub chips
  const subChips = $("subChips");

  if (!listEl || !countBadge || !searchInput) {
    console.error("❌ IDs HTML manquants (list, countBadge, searchInput)");
    return;
  }

  /* ================= STATE ================= */
  let activeType = "all";
  let activeSub = "all";
  let selected = null;
  let pokedex = [];
  let featured = null;

  let favs = loadFavs();
  let favOnly = false;

  /* ================= UI TOGGLES ================= */
  function setLoading(on) {
    if (listSkeleton) listSkeleton.style.display = on ? "block" : "none";
    if (detailsSkeleton) detailsSkeleton.style.display = on ? "block" : "none";
    if (detailsReal) detailsReal.style.display = on ? "none" : "block";
  }

  function updateFavBadge() {
    if (!favBadge) return;
    favBadge.textContent = `❤️ ${favs.size}`;
  }

  function setShinyMode(on) {
    document.body.classList.toggle("shiny-mode", Boolean(on));
    if (themeBtn) themeBtn.textContent = on ? "✨ Shiny ON" : "✨ Shiny";
    try {
      localStorage.setItem(LS_SHINY, on ? "1" : "0");
    } catch {}
  }

  function initShinyMode() {
    try {
      const v = localStorage.getItem(LS_SHINY);
      setShinyMode(v === "1");
    } catch {
      setShinyMode(false);
    }
  }

  /* ================= SUB CHIPS ================= */
  const MICRONS = ["120u", "90u", "73u", "45u"];
  const WEEDKINDS = ["indica", "sativa", "hybrid"];

  function renderSubChips() {
    if (!subChips) return;

    let items = [];
    if (activeType === "hash" || activeType === "extraction" || activeType === "wpff") {
      items = ["all", ...MICRONS];
    } else if (activeType === "weed") {
      items = ["all", ...WEEDKINDS];
    } else {
      items = [];
    }

    if (!items.length) {
      subChips.style.display = "none";
      subChips.innerHTML = "";
      activeSub = "all";
      return;
    }

    subChips.style.display = "flex";
    subChips.innerHTML = "";

    items.forEach((v) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-sm pill-btn";
      btn.dataset.sub = v;

      if (v === "all") btn.textContent = "Sous-cat: Tous";
      else if (WEEDKINDS.includes(v)) btn.textContent = weedKindLabel(v);
      else btn.textContent = v;

      if (v === activeSub) btn.classList.add("active");

      btn.addEventListener("click", () => {
        activeSub = v;
        [...subChips.querySelectorAll("button")].forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderList();
      });

      subChips.appendChild(btn);
    });
  }

  /* ================= LOAD FROM API ================= */
  async function loadCards() {
    const res = await fetch("/api/cards", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const mapped = (Array.isArray(data) ? data : []).map((c) => ({
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
      is_featured: Boolean(c.is_featured),
      featured_title: c.featured_title || null,
    }));

    pokedex = mapped.length ? mapped : fallbackPokedex;
  }

  async function loadFeatured() {
    try {
      const res = await fetch("/api/featured", { cache: "no-store" });
      if (!res.ok) {
        featured = null;
        if (featuredBox) featuredBox.style.display = "none";
        return;
      }
      const c = await res.json();
      if (!c) {
        featured = null;
        if (featuredBox) featuredBox.style.display = "none";
        return;
      }

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
        featured_title: c.featured_title || "✨ Shiny du moment",
      };

      renderFeatured();
    } catch {
      featured = null;
      if (featuredBox) featuredBox.style.display = "none";
    }
  }

  /* ================= FEATURED RENDER ================= */
  function makeSparkles() {
    if (!sparkles) return;
    sparkles.innerHTML = "";
    const pts = [
      [8, 18],[16, 62],[28, 34],[44, 18],[62, 30],[74, 60],[88, 28]
    ];
    pts.forEach(([x, y], i) => {
      const s = document.createElement("div");
      s.className = "sparkle";
      s.style.left = `${x}%`;
      s.style.top = `${y}%`;
      s.style.animationDelay = `${(i * 0.22).toFixed(2)}s`;
      s.style.opacity = String(0.18 + (i % 3) * 0.12);
      sparkles.appendChild(s);
    });
  }

  function featuredMetaText(c) {
    if (!c) return "—";
    if (c.type === "weed" && c.weed_kind) return `#${c.id} • ${typeLabel(c.type)} • ${weedKindLabel(c.weed_kind)}`;
    if (c.type !== "weed" && c.micron) return `#${c.id} • ${typeLabel(c.type)} • ${c.micron}`;
    return `#${c.id} • ${typeLabel(c.type)}`;
  }

  function renderFeatured() {
    if (!featuredBox || !featured) return;
    featuredBox.style.display = "block";

    makeSparkles();

    if (featuredImg) featuredImg.src = featured.img;
    if (featuredTitle) featuredTitle.textContent = featured.featured_title || "✨ Shiny du moment";
    if (featuredName) featuredName.textContent = featured.name;
    if (featuredMeta) featuredMeta.textContent = featuredMetaText(featured);
    if (featuredLine) featuredLine.textContent = `🧬 ${cardDesc(featured)}`;

    if (featuredCount) {
      featuredCount.style.display = "inline-block";
      featuredCount.textContent = `Rare #${featured.id}`;
    }

    if (featuredViewBtn) {
      featuredViewBtn.onclick = () => {
        // local counter
        const views = incFeaturedViews(featured.id);
        toast(`✨ Rare vu (${views})`);

        // server tracking
        track("view_featured", { card_id: featured.id });

        selectCard(featured, { scroll: true, fromFeatured: true });
      };
    }
  }

  /* ================= FILTERS ================= */
  function matchesQuery(card, q) {
    if (!q) return true;

    const hay = [
      card.name,
      card.type,
      card.micron,
      card.weed_kind,
      card.thc,
      cardDesc(card),
      ...(card.terpenes || []),
      ...(card.aroma || []),
      ...(card.effects || []),
      card.advice,
    ].map((x) => norm(x)).join(" ");

    return hay.includes(q);
  }

  function typeOk(card) {
    return activeType === "all" || norm(card.type) === activeType;
  }

  function subOk(card) {
    if (activeSub === "all") return true;

    if (activeType === "weed") return norm(card.weed_kind) === activeSub;
    if (activeType === "hash" || activeType === "extraction" || activeType === "wpff") return norm(card.micron) === activeSub;

    return true;
  }

  function favOk(card) {
    if (!favOnly) return true;
    return favs.has(String(card.id));
  }

  function filteredList() {
    const q = norm(searchInput.value);
    return pokedex.filter((p) => typeOk(p) && subOk(p) && favOk(p) && matchesQuery(p, q));
  }

  /* ================= SORT ================= */
  function sortCards(arr) {
    const mode = sortSelect?.value || "new";
    const out = [...arr];

    if (mode === "az") {
      out.sort((a, b) => safeStr(a.name).localeCompare(safeStr(b.name), "fr", { sensitivity: "base" }));
      return out;
    }
    if (mode === "thc") {
      out.sort((a, b) => parseThcNumber(b.thc) - parseThcNumber(a.thc));
      return out;
    }

    out.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    return out;
  }

  /* ================= RENDER LIST ================= */
  function listMetaLine(p) {
    if (p.type === "weed" && p.weed_kind) return `${typeLabel(p.type)} • ${weedKindLabel(p.weed_kind)}`;
    if (p.type !== "weed" && p.micron) return `${typeLabel(p.type)} • ${p.micron}`;
    return `${typeLabel(p.type)}`;
  }

  function renderList() {
    let items = filteredList();
    items = sortCards(items);

    countBadge.textContent = items.length;
    listEl.innerHTML = "";

    if (!items.length) {
      listEl.innerHTML = `<div class="text-secondary p-2">Aucun résultat…</div>`;
      return;
    }

    const featuredId = featured ? String(featured.id) : null;

    items.forEach((p) => {
      const btn = document.createElement("button");
      btn.className =
        "list-group-item list-group-item-action bg-black text-white border-secondary d-flex align-items-center gap-2 rounded-3 mb-2";

      const shinyBadge =
        featuredId && String(p.id) === featuredId
          ? `<span class="badge text-bg-warning text-dark ms-2">✨ Shiny</span>`
          : "";

      const favBadgeMini = favs.has(String(p.id))
        ? `<span class="badge text-bg-warning text-dark ms-2">❤️</span>`
        : "";

      btn.innerHTML = `
        <img src="${p.img}" width="40" height="40" style="object-fit:cover;border-radius:8px;" />
        <div class="flex-grow-1 text-start">
          <div class="fw-semibold">${p.name}${shinyBadge}${favBadgeMini}</div>
          <div class="small text-secondary">#${p.id} • ${listMetaLine(p)}</div>
        </div>
        <span class="badge text-bg-danger">Voir</span>
      `;

      btn.onclick = () => selectCard(p, { scroll: true });
      listEl.appendChild(btn);
    });
  }

  /* ================= SELECT ================= */
  function updateFavBtn() {
    if (!favBtn || !selected) return;
    const inFav = favs.has(String(selected.id));
    favBtn.textContent = inFav ? "❤️ Retirer des favoris" : "❤️ Ajouter aux favoris";
  }

  function selectCard(p, opts = {}) {
    selected = p;

    if (pokeName) pokeName.textContent = p.name;
    if (pokeId) pokeId.textContent = `#${p.id}`;

    const cat = listMetaLine(p);
    if (pokeType) pokeType.textContent = cat;

    if (pokeThc) pokeThc.textContent = p.thc;

    if (pokeDesc) {
      const line1 = `🧬 Profil: ${cardDesc(p) || "—"}`;
      const line2 = `🌿 Terpènes: ${formatList(p.terpenes)}`;
      const line3 = `👃 Arômes: ${formatList(p.aroma)}`;
      const line4 = `🧠 Effets (ressenti): ${formatList(p.effects)}`;
      const line5 = `⚠️ Conseils: ${p.advice || "—"}`;

      pokeDesc.textContent = [line1, "", line2, line3, line4, "", line5].join("\n");
    }

    if (pokeImg) {
      pokeImg.src = p.img;
      pokeImg.style.display = "inline-block";
    }
    if (placeholder) placeholder.style.display = "none";

    updateFavBtn();

    // server tracking
    track("view_card", { card_id: p.id });

    if (opts.scroll) scrollToDetails();
  }

  /* ================= EVENTS ================= */
  searchInput.oninput = renderList;

  clearBtn?.addEventListener("click", () => {
    searchInput.value = "";
    renderList();
    toast("Recherche effacée");
    track("search_clear");
  });

  document.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      activeType = btn.dataset.type || "all";
      activeSub = "all";
      renderSubChips();
      renderList();

      track("filter_type", { meta: { type: activeType } });
    });
  });

  sortSelect?.addEventListener("change", () => {
    renderList();
    toast("Tri appliqué");
    track("sort", { meta: { sort: sortSelect.value } });
  });

  favToggle?.addEventListener("click", () => {
    favOnly = !favOnly;
    favToggle.classList.toggle("active", favOnly);
    favToggle.textContent = favOnly ? "❤️ Favoris ON" : "❤️ Favoris";
    renderList();
    track("fav_toggle", { meta: { favOnly } });
  });

  favBtn?.addEventListener("click", () => {
    if (!selected) return;
    const k = String(selected.id);

    const willRemove = favs.has(k);

    if (willRemove) {
      favs.delete(k);
      toast("Retiré des favoris");
    } else {
      favs.add(k);
      toast("Ajouté aux favoris");
    }

    saveFavs(favs);
    updateFavBadge();
    updateFavBtn();
    renderList();

    track(willRemove ? "fav_remove" : "fav_add", { card_id: selected.id });
  });

  themeBtn?.addEventListener("click", () => {
    const on = !document.body.classList.contains("shiny-mode");
    setShinyMode(on);
    toast(on ? "✨ Shiny ON" : "✨ Shiny OFF");
    track("theme_toggle", { meta: { on } });
  });

  randomBtn?.addEventListener("click", () => {
    const items = sortCards(filteredList());
    if (!items.length) return;

    track("random");

    if (featured && Math.random() < 0.15) {
      const views = incFeaturedViews(featured.id);
      toast(`✨ Shiny du moment (${views})`);
      return selectCard(featured, { scroll: true, fromFeatured: true });
    }

    selectCard(items[Math.floor(Math.random() * items.length)], { scroll: true });
  });

  shareBtn?.addEventListener("click", async () => {
    if (!selected) return;

    track("share", { card_id: selected.id });

    const shareText =
      `🧬 ${selected.name} (#${selected.id})\n` +
      `Catégorie: ${listMetaLine(selected)}\n` +
      `${selected.thc}\n\n` +
      `🌿 Terpènes: ${formatList(selected.terpenes)}\n` +
      `👃 Arômes: ${formatList(selected.aroma)}\n` +
      `🧠 Effets (ressenti): ${formatList(selected.effects)}\n\n` +
      `🧬 Profil: ${cardDesc(selected)}\n\n` +
      `⚠️ ${selected.advice || "Info éducative. Les effets varient."}`;

    try {
      await navigator.share?.({ text: shareText });
      return;
    } catch {}

    try {
      await navigator.clipboard?.writeText(shareText);
    } catch {}

    tg?.showPopup({
      title: "Partager",
      message: "Fiche copiée ✅",
      buttons: [{ type: "ok" }],
    });
  });

  closeBtn?.addEventListener("click", () => {
    if (tg) tg.close();
    else window.close();
  });

  /* ================= INIT ================= */
  (async () => {
    initShinyMode();
    updateFavBadge();

    setLoading(true);

    // NEW: open_app tracking
    track("open_app");

    try {
      await loadCards();
    } catch (e) {
      console.error("❌ loadCards:", e);
      pokedex = fallbackPokedex;
    }

    await loadFeatured();

    renderSubChips();
    renderList();

    if (featured) {
      const v = getFeaturedViews(featured.id);
      if (v > 0) toast(`✨ Déjà vu ${v} fois`);
    }

    setLoading(false);
  })();
})();
