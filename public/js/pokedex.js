(() => {
  /* ================= TELEGRAM ================= */
  const tg = window.Telegram?.WebApp;
  if (tg) {
    try { tg.ready(); tg.expand(); } catch {}
  }
  const tgUserId = tg?.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : null;

  /* ================= HELPERS ================= */
  const $ = (id) => document.getElementById(id);
  const safeStr = (v) => (v == null ? "" : String(v));
  const norm = (v) => safeStr(v).trim().toLowerCase();

  const typeLabel = (t) =>
    ({ hash: "Hash", weed: "Weed", extraction: "Extraction", wpff: "WPFF" }[t] || t);

  const weedKindLabel = (k) =>
    ({ indica: "Indica", sativa: "Sativa", hybrid: "Hybrid" }[k] || k);

  const formatList = (arr) => (Array.isArray(arr) && arr.length ? arr.join(", ") : "—");

  function cardDesc(c) {
    return c.desc ?? c.description ?? c.profile ?? "—";
  }

  function haptic(style = "light") {
    try { tg?.HapticFeedback?.impactOccurred?.(style); } catch {}
  }

  function toast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.style.display = "none"), 1400);
  }

  function parseThcScore(thcText) {
    const s = safeStr(thcText);
    const nums = (s.match(/\d+(\.\d+)?/g) || []).map(Number).filter((n) => !Number.isNaN(n));
    if (!nums.length) return 0;
    return Math.max(...nums);
  }

  function scrollToDetails() {
    // ✅ on scrolle sur l’ancre prévue dans le HTML
    const anchor = document.getElementById("detailsAnchor") || document.getElementById("pokeName");
    if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const listSkeleton = $("listSkeleton");
  const detailsSkeleton = $("detailsSkeleton");
  const detailsReal = $("detailsReal");

  const featuredBox = $("featuredBox");
  const featuredImg = $("featuredImg");
  const featuredTitle = $("featuredTitle");
  const featuredName = $("featuredName");
  const featuredMeta = $("featuredMeta");
  const featuredLine = $("featuredLine");
  const featuredViewBtn = $("featuredViewBtn");
  const featuredCount = $("featuredCount");
  const sparklesWrap = $("sparkles");

  // Partner box
  const partnerBox = $("partnerBox");
  const partnerImg = $("partnerImg");
  const partnerTitle = $("partnerTitle");
  const partnerName = $("partnerName");
  const partnerMeta = $("partnerMeta");
  const partnerLine = $("partnerLine");
  const partnerViewBtn = $("partnerViewBtn");

  // Sections
  const sectionsWrap = $("sectionsWrap");
  const popularList = $("popularList");
  const trendingList = $("trendingList");
  const newestList = $("newestList");
  const popularSeeAll = $("popularSeeAll");
  const trendingSeeAll = $("trendingSeeAll");
  const newestSeeAll = $("newestSeeAll");

  // Admin web
  const adminWrap = $("adminWrap");
  const adminBtnWeb = $("adminBtnWeb");

  // MyDex/Profile panels
  const myDexList = $("myDexList");
  const myDexEmpty = $("myDexEmpty");

  const profileUserId = $("profileUserId");
  const profileFavCount = $("profileFavCount");

  if (!listEl || !countBadge || !searchInput) {
    console.error("❌ IDs HTML manquants (list/countBadge/searchInput).");
    return;
  }

  /* ================= STATE ================= */
  let pokedex = [];
  let featured = null;
  let subcategories = [];
  let farms = [];
  let activeFarm = "all";

  let activeType = "all";
  let activeSub = "all"; // all | indica/sativa/hybrid | subcategory id
  let selected = null;

  let sortMode = "new"; // new | az | thc
  let showFavOnly = false;

  /* ================= FALLBACK DATA ================= */
  const fallbackPokedex = [
    {
      id: 101,
      name: "Static Hash (exemple)",
      type: "hash",
      micron: null,
      weed_kind: null,
      thc: "THC: 35–55% (exemple)",
      desc: "Hash sec, texture sableuse, très parfumé.",
      img: "https://i.imgur.com/0HqWQvH.png",
      terpenes: ["Myrcene", "Caryophyllene"],
      aroma: ["Terreux", "Épicé", "Boisé"],
      effects: ["Relax (ressenti)", "Calme (ressenti)"],
      advice: "Commence bas. Évite de mélanger. Respecte la législation.",
      subcategory: "static_sift",
    },
  ];

  /* ================= PERSIST ================= */
  const LS = {
    fav: "pk_favs_v2",
    theme: "pk_theme_v2",
  };

  function loadFavsLocal() {
    try {
      const raw = localStorage.getItem(LS.fav);
      const arr = JSON.parse(raw || "[]");
      return new Set((Array.isArray(arr) ? arr : []).map(String));
    } catch {
      return new Set();
    }
  }
  function saveFavsLocal(set) {
    try { localStorage.setItem(LS.fav, JSON.stringify([...set])); } catch {}
  }
  let favsLocal = loadFavsLocal(); // fallback/local

  /* ================= API ================= */
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

  async function loadCards() {
    try {
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
        subcategory: c.subcategory || c.sub_category || null, // ✅ compat
      }));

      pokedex = mapped.length ? mapped : fallbackPokedex;
    } catch (e) {
      console.error("❌ /api/cards KO :", e);
      pokedex = fallbackPokedex;
    }
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
        subcategory: c.subcategory || c.sub_category || null,
      };

      renderFeatured();
    } catch {
      featured = null;
      if (featuredBox) featuredBox.style.display = "none";
    }
  }

  async function loadSubcategories() {
    try {
      const res = await fetch("/api/subcategories", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      subcategories = Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn("⚠️ /api/subcategories KO -> fallback", e);
      subcategories = [
        { id:"dry_sift", type:"hash", label:"Dry Sift", sort:10 },
        { id:"static_sift", type:"hash", label:"Static Sift", sort:15 },
        { id:"ice_o_lator", type:"hash", label:"Ice-O-Lator", sort:20 },
        { id:"full_melt", type:"hash", label:"Full Melt", sort:30 },
        { id:"rosin", type:"extraction", label:"Rosin", sort:10 },
      ];
    }
  }

  /* ================= THEME ================= */
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

  /* ================= UI LOADING ================= */
  function setLoading(isLoading) {
    if (listSkeleton) listSkeleton.style.display = isLoading ? "block" : "none";
    if (detailsSkeleton) detailsSkeleton.style.display = isLoading ? "block" : "none";
    if (detailsReal) detailsReal.style.display = isLoading ? "none" : "block";
  }

  /* ================= FEATURED ================= */
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

  function extraText(card) {
    const t = norm(card.type);
    if (t === "weed") return card.weed_kind ? ` • ${weedKindLabel(norm(card.weed_kind))}` : "";
    // ✅ on ne montre PAS micron en sous-catégorie, mais on peut l’afficher dans la fiche
    return card.micron ? ` • ${norm(card.micron)}` : "";
  }

  function renderFeatured() {
    if (!featuredBox || !featured) return;
    featuredBox.style.display = "block";

    if (featuredImg) featuredImg.src = featured.img;
    if (featuredTitle) featuredTitle.textContent = featured.featured_title || "✨ Shiny du moment";
    if (featuredName) featuredName.textContent = featured.name;
    if (featuredMeta) featuredMeta.textContent = `#${featured.id} • ${typeLabel(featured.type)}${extraText(featured)}`;
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

    featuredViewBtn?.addEventListener("click", () => {
      selectCard(featured, true);
      toast("✨ Rare affiché !");
      haptic("medium");
    });
  }

  /* ================= SUB-CHIPS ================= */
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
        .filter((s) => s.type === activeType)
        .sort((a, b) => (a.sort || 0) - (b.sort || 0))
        .map((s) => ({ label: s.label, value: s.id }));

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

  /* ================= FILTER + SORT ================= */
  function matchesFilters(card) {
    const q = norm(searchInput?.value || "");
    const t = norm(card.type);

    if (activeType !== "all" && t !== activeType) return false;

    // ✅ sous-catégories :
    // - weed : weed_kind
    // - autres : card.subcategory (champ conseillé)
    if (activeType === "weed") {
      if (activeSub !== "all") {
        if (norm(card.weed_kind) !== activeSub) return false;
      }
    } else {
      if (activeSub !== "all") {
        const sc = norm(card.subcategory);
        // si pas de subcategory en DB, on ne casse pas le Dex :
        if (sc && sc !== activeSub) return false;
        if (!sc) {
          // si aucune donnée, on laisse passer (soft filter)
        }
      }
    }

    if (showFavOnly) {
      if (!isFavorited(card.id)) return false;
    }

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
    if (sortMode === "az") {
      copy.sort((a, b) => safeStr(a.name).localeCompare(safeStr(b.name)));
      return copy;
    }
    if (sortMode === "thc") {
      copy.sort((a, b) => parseThcScore(b.thc) - parseThcScore(a.thc));
      return copy;
    }
    // new: id DESC (ou created_at si tu veux plus tard)
    copy.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    return copy;
  }

  /* ================= FAVORITES ================= */
  function isFavorited(cardId) {
    return favsLocal.has(String(cardId));
  }

  function setFavUI(card) {
    if (!favBtn) return;
    if (!card) {
      favBtn.textContent = "❤️ Ajouter aux favoris";
      return;
    }
    favBtn.textContent = isFavorited(card.id) ? "💔 Retirer des favoris" : "❤️ Ajouter aux favoris";
  }

  function updateBadges() {
    if (countBadge) countBadge.textContent = String(pokedex.length || 0);
    if (favBadge) favBadge.textContent = `❤️ ${favsLocal.size}`;
    if (profileFavCount) profileFavCount.textContent = String(favsLocal.size);
  }

  /* ================= RENDER LIST ================= */
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

      const subTxt = (() => {
        if (norm(c.type) === "weed" && c.weed_kind) return ` • ${weedKindLabel(norm(c.weed_kind))}`;
        // ✅ on n’affiche pas les microns en sous-catégorie, seulement éventuellement subcategory label
        const sc = norm(c.subcategory);
        if (!sc) return "";
        const found = (subcategories || []).find(x => x.id === sc);
        return found ? ` • ${found.label}` : "";
      })();

      btn.innerHTML = `
        <div class="d-flex align-items-center justify-content-between gap-2">
          <div class="d-flex align-items-center gap-2">
            <img src="${c.img}" alt="" width="42" height="42" style="border-radius:12px; object-fit:cover; border:1px solid rgba(255,255,255,.10);">
            <div>
              <div class="fw-bold">${safeStr(c.name)}</div>
              <div class="text-secondary small">#${c.id} • ${typeLabel(c.type)}${subTxt}</div>
            </div>
          </div>
          <div class="text-warning">${isFavorited(c.id) ? "❤️" : ""}</div>
        </div>
      `;

      btn.addEventListener("click", () => {
        selectCard(c, true);
      });

      listEl.appendChild(btn);
    });
  }

  /* ================= SELECT CARD ================= */
  function selectCard(card, doScroll = false) {
    selected = card;

    if (pokeName) pokeName.textContent = safeStr(card.name);
    if (pokeId) pokeId.textContent = `#${card.id}`;

    if (pokeImg) {
      pokeImg.src = card.img || "https://i.imgur.com/0HqWQvH.png";
      pokeImg.style.display = "block";
    }
    if (placeholder) placeholder.style.display = "none";

    if (pokeType) {
      const t = norm(card.type);
      let sub = "";
      if (t === "weed" && card.weed_kind) sub = ` • ${weedKindLabel(norm(card.weed_kind))}`;
      const sc = norm(card.subcategory);
      if (sc && t !== "weed") {
        const found = (subcategories || []).find(x => x.id === sc);
        if (found) sub = ` • ${found.label}`;
      }
      // ✅ micron affiché dans la fiche (pas en sous chips)
      const micron = (t !== "weed" && card.micron) ? ` • ${norm(card.micron)}` : "";
      pokeType.textContent = `${typeLabel(card.type)}${sub}${micron}`;
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

    if (pokeDesc) pokeDesc.textContent = lines.join("\n");

    setFavUI(card);
    updateBadges();

    if (doScroll) scrollToDetails();
  }

  /* ================= MYDEX / PROFILE ================= */
  async function loadMyDex() {
    if (!myDexList || !myDexEmpty) return;

    myDexList.innerHTML = "";
    myDexEmpty.style.display = "block";

    // priorité : API si Telegram
    let cards = [];
    if (tgUserId) {
      try {
        const apiCards = await apiLoadMyDexCards();
        // map au format local
        cards = (apiCards || []).map((c) => ({
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
          subcategory: c.subcategory || c.sub_category || null,
        }));

        // sync local favs from server set
        favsLocal = new Set(cards.map(x => String(x.id)));
        saveFavsLocal(favsLocal);
        updateBadges();
      } catch (e) {
        console.warn("⚠️ loadMyDex API KO", e);
      }
    } else {
      // fallback local favorites
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
        // retour Dex + select
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

  // expose for bottom nav script (index.html)
  window.loadMyDex = loadMyDex;
  window.loadProfile = loadProfile;

  /* ================= ADMIN WEB ================= */
  const ADMIN_IDS = new Set(["6675436692"]);
  if (tgUserId && ADMIN_IDS.has(String(tgUserId))) {
    if (adminWrap) adminWrap.style.display = "block";
    adminBtnWeb?.addEventListener("click", () => {
      const txt = 
`👑 Commandes Admin

• /addform — ajouter une fiche
• /editform — modifier via menus
• /delform — supprimer via menus
• /rare <id> (titre optionnel)
• /unrare
• /partner <id> (titre optionnel)
• /unpartner
• /dbtest
• /myid`;
      alert(txt);
    });
  }

  /* ================= EVENTS ================= */
  // category chips
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

  // search
  searchInput?.addEventListener("input", () => renderList());
  clearBtn?.addEventListener("click", () => {
    searchInput.value = "";
    renderList();
    haptic("light");
  });

  // sort
  sortSelect?.addEventListener("change", () => {
    sortMode = sortSelect.value || "new";
    renderList();
    haptic("light");
  });

  // fav only
  favToggle?.addEventListener("click", () => {
    showFavOnly = !showFavOnly;
    favToggle.classList.toggle("active", showFavOnly);
    favToggle.textContent = showFavOnly ? "❤️ Favoris ON" : "❤️ Favoris";
    renderList();
    haptic("light");
  });

  // random
  randomBtn?.addEventListener("click", () => {
    const items = pokedex.filter(matchesFilters);
    if (!items.length) return toast("Aucune fiche");
    const pick = items[Math.floor(Math.random() * items.length)];
    selectCard(pick, true);
    toast("🎲 Random !");
    haptic("medium");
  });

  // share
  shareBtn?.addEventListener("click", () => {
    if (!selected) return toast("Sélectionne une fiche");
    const text = `🧬 ${selected.name} (#${selected.id}) — ${typeLabel(selected.type)}\n${selected.thc}\n${cardDesc(selected)}`;
    try {
      tg?.shareText?.(text);
    } catch {
      navigator.clipboard?.writeText?.(text);
      toast("📋 Copié !");
    }
  });

  // close
  closeBtn?.addEventListener("click", () => {
    try { tg?.close(); } catch {}
  });

  // theme
  themeBtn?.addEventListener("click", toggleTheme);

  // fav toggle on selected
  favBtn?.addEventListener("click", async () => {
    if (!selected) return toast("Sélectionne une fiche");
    const id = selected.id;

    // ✅ si Telegram: API Supabase
    if (tgUserId) {
      try {
        const out = await apiToggleFav(id);
        // out = { favorited: true/false }
        if (out?.favorited) favsLocal.add(String(id));
        else favsLocal.delete(String(id));
        saveFavsLocal(favsLocal);
        setFavUI(selected);
        updateBadges();
        toast(out?.favorited ? "❤️ Ajouté au Dex" : "💔 Retiré du Dex");
        haptic("medium");
        return;
      } catch (e) {
        console.warn("⚠️ apiToggleFav KO -> fallback local", e);
      }
    }

    // fallback local
    const key = String(id);
    if (favsLocal.has(key)) favsLocal.delete(key);
    else favsLocal.add(key);
    saveFavsLocal(favsLocal);
    setFavUI(selected);
    updateBadges();
    toast(favsLocal.has(key) ? "❤️ Ajouté (local)" : "💔 Retiré (local)");
    haptic("medium");
  });

  /* ================= INIT ================= */
  async function init() {
    applyThemeFromStorage();
    setLoading(true);

    await Promise.all([loadSubcategories(), loadFarms(), loadCards()]);
    await loadFeatured();

    renderSubChips();
    renderList();

    // préselect : première carte
    if (pokedex.length) selectCard(pokedex[0], false);

    // profile init
    loadProfile();
    updateBadges();

    setLoading(false);

    // hash route support
    const h = (window.location.hash || "").toLowerCase();
    if (h === "#mydex") {
      document.getElementById("btnNavMyDex")?.click?.();
    } else if (h === "#profile") {
      document.getElementById("btnNavProfile")?.click?.();
    }
  }

  init();
})();
