
  function dedupeBottomBar() {
    const bars = document.querySelectorAll("#bottomBar");
    bars.forEach((b, i) => { if (i > 0) b.remove(); });
    const modals = document.querySelectorAll("#profileModal");
    modals.forEach((m, i) => { if (i > 0) m.remove(); });
  }

(() => {
  /* ================= TELEGRAM ================= */
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  const tgUserId = tg?.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : null;

  /* ================= FALLBACK DATA (si API KO) ================= */
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
    },
  ];

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

  function toast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.style.display = "none"), 1400);
  }

  
  function scrollToDetails() {
    const el = document.getElementById("detailsCard") || document.getElementById("details") || document.querySelector(".details-card");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

function haptic(kind = "impact", style = "light") {
    try {
      tg?.HapticFeedback?.impactOccurred?.(style);
    } catch {}
  }

  function parseThcScore(thcText) {
    // essaie d’extraire un nombre "max" depuis "THC: 70–90%" ou "70-90"
    const s = safeStr(thcText);
    const nums = (s.match(/\d+(\.\d+)?/g) || []).map(Number).filter((n) => !Number.isNaN(n));
    if (!nums.length) return 0;
    return Math.max(...nums);
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
  const favToggle = $("favToggle");
  const favBtn = $("favBtn");

  // bottom nav
  const navDex = $("navDex");
  const navMyDex = $("navMyDex");
  const navProfile = $("navProfile");
  const bottomNav = $("bottomNav");

  // profile modal
  const profileModal = $("profileModal");
  const profileUserId = $("profileUserId");
  const profileFavCount = $("profileFavCount");
  const profileCloseBtn = $("profileCloseBtn");

  const subChips = $("subChips");

  
  if (subChips) subChips.classList.add("subchip-scroll");
const pokeName = $("pokeName");
  const pokeId = $("pokeId");
  const pokeImg = $("pokeImg");
  const placeholder = $("placeholder");
  const pokeType = $("pokeType");
  const pokeThc = $("pokeThc");
  const pokeDesc = $("pokeDesc");

  // skeletons
  const listSkeleton = $("listSkeleton");
  const detailsSkeleton = $("detailsSkeleton");
  const detailsReal = $("detailsReal");

  // featured
  const featuredBox = $("featuredBox");
  const featuredImg = $("featuredImg");
  const featuredTitle = $("featuredTitle");
  const featuredName = $("featuredName");
  const featuredMeta = $("featuredMeta");
  const featuredLine = $("featuredLine");
  const featuredViewBtn = $("featuredViewBtn");
  const featuredCount = $("featuredCount");
  const sparklesWrap = $("sparkles");

  if (!listEl || !countBadge || !searchInput) {
    console.error("❌ IDs HTML manquants");
    return;
  }

  /* ================= STATE ================= */
  let activeType = "all";
  let subcategories = [];

  let activeSub = "all";
  let selected = null;
  let pokedex = [];
  let featured = null;

  let sortMode = "new";     // new | az | thc
  let showFavOnly = false;

  const micronValues = ["120u", "90u", "73u", "45u"];
  const weedKindValues = ["indica", "sativa", "hybrid"];

  /* ================= PERSIST ================= */
  const LS = {
    fav: "pk_favs_v1",
    theme: "pk_theme_v1",
  };

  function loadFavs() {
    try {
      const raw = localStorage.getItem(LS.fav);
      const arr = JSON.parse(raw || "[]");
      return new Set((Array.isArray(arr) ? arr : []).map(String));
    } catch {
      return new Set();
    }
  }
  function saveFavs(set) {
    try {
      localStorage.setItem(LS.fav, JSON.stringify([...set]));
    } catch {}
  }

  
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

  async function apiLoadMyDexIds() {
    if (!tgUserId) return new Set();
    const res = await fetch("/api/mydex/" + encodeURIComponent(tgUserId), { cache: "no-store" });
    if (!res.ok) return new Set();
    const data = await res.json();
    const ids = new Set((Array.isArray(data) ? data : []).map((c) => String(c.id)));
    return ids;
  }

let favs = loadFavs();

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
    haptic("impact", "medium");
  }

  /* ================= SKELETON ================= */
  function setLoading(isLoading) {
    if (listSkeleton) listSkeleton.style.display = isLoading ? "block" : "none";
    if (detailsSkeleton) detailsSkeleton.style.display = isLoading ? "block" : "none";
    if (detailsReal) detailsReal.style.display = isLoading ? "none" : "block";
  }

  /* ================= LOAD FROM API ================= */
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
      };

      renderFeatured();
    } catch {
      featured = null;
      if (featuredBox) featuredBox.style.display = "none";
    }
  }

  function extraText(card) {
    const t = norm(card.type);
    if (t === "weed") return card.weed_kind ? ` • ${weedKindLabel(norm(card.weed_kind))}` : "";
    return card.micron ? ` • ${norm(card.micron)}` : "";
  }

  /* ================= SPARKLES ================= */
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

  /* ================= FEATURED ================= */
  function renderFeatured() {
    if (!featuredBox || !featured) return;
    featuredBox.style.display = "block";

    if (featuredImg) featuredImg.src = featured.img;
    if (featuredTitle) featuredTitle.textContent = featured.featured_title || "✨ Shiny du moment";
    if (featuredName) featuredName.textContent = featured.name;
    if (featuredMeta) featuredMeta.textContent = `#${featured.id} • ${typeLabel(featured.type)}${extraText(featured)}`;
    if (featuredLine) featuredLine.textContent = `🧬 ${cardDesc(featured)}`;

    // compteur
    try {
      const total = pokedex.length || 0;
      const pos = total ? (pokedex.findIndex((x) => String(x.id) === String(featured.id)) + 1) : 0;
      if (featuredCount && total) {
        featuredCount.style.display = "inline-block";
        featuredCount.textContent = `Rare #${pos || 1}/${total}`;
      }
    } catch {}

    // sparkles
    makeSparkles();

    featuredViewBtn?.addEventListener("click", () => {
      selectCard(featured);
      toast("✨ Rare affiché !");
      haptic("impact", "medium");
      $("pokeName")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

    // Weed: filtre sur weed_kind
    if (activeType === "weed") {
      options = options.concat([
        { label: "Indica", value: "indica" },
        { label: "Sativa", value: "sativa" },
        { label: "Hybrid", value: "hybrid" },
      ]);
      if (activeSub !== "all" && !weedKindValues.includes(activeSub)) activeSub = "all";
    } else {
      // Hash / Extraction / WPFF: sous-catégories (PAS micron)
      const subs = (subcategories || [])
        .filter((s) => s.type === activeType)
        .sort((a, b) => (a.sort || 0) - (b.sort || 0))
        .map((s) => ({ label: s.label, value: s.id }));
      options = options.concat(subs);

      // si carte n'a pas de champ subcategory, ce filtre est "soft" (n'exclut rien)
      if (activeSub !== "all" && !subs.some((s) => s.value === activeSub)) activeSub = "all";
    }

    options.forEach((opt) => {
      const btn = chipBtn(opt.label, opt.value, activeSub === opt.value);
      btn.addEventListener("click", () => {
        activeSub = opt.value;
        renderSubChips();
        renderList();
        haptic("impact", "light");
      });
      subChips.appendChild(btn);
    });
  }


  async function loadSubcategories() {
    try {
      const res = await fetch("/api/subcategories", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      subcategories = Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn("⚠️ /api/subcategories KO, fallback statique", e);
      subcategories = [
        { id:"dry_sift", type:"hash", label:"Dry Sift", sort:10 },
        { id:"static_sift", type:"hash", label:"Static Sift", sort:15 },
        { id:"ice_o_lator", type:"hash", label:"Ice-O-Lator", sort:20 },
        { id:"full_melt", type:"hash", label:"Full Melt", sort:30 },

        { id:"flower", type:"weed", label:"Flower", sort:10 },
        { id:"small_buds", type:"weed", label:"Small Buds", sort:20 },

        { id:"rosin", type:"extraction", label:"Rosin", sort:10 },
        { id:"bho", type:"extraction", label:"BHO", sort:20 },
        { id:"live_resin", type:"extraction", label:"Live Resin", sort:30 },

        { id:"wpff_fresh", type:"wpff", label:"Fresh Frozen", sort:10 },
        { id:"wpff_cure", type:"wpff", label:"Cured", sort:20 },
      ];
    }
  }
)();
  // Hash routing (#mydex, #profile)
  function applyHashRoute() {
    const h = (window.location.hash || "").toLowerCase();
    if (h === "#mydex") {
      view = "mydex";
      if (favToggle) favToggle.checked = true;
      syncBottom();
      render();
      return;
    }
    if (h === "#profile") {
      openProfile();
      return;
    }
    // default
    view = (favToggle && favToggle.checked) ? "mydex" : "dex";
    syncBottom();
    render();
  }

  window.addEventListener("hashchange", applyHashRoute);

