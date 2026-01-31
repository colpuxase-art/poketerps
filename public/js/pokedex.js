(() => {
  /* ================= TELEGRAM ================= */
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

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

  function mkChip(label, isActive, onClick, opts = {}) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (isActive ? " active" : "") + (opts.disabled ? " disabled" : "");
    b.textContent = label;
    if (!opts.disabled) b.onclick = onClick;
    return b;
  }

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

  const subChips = $("subChips");
  const farmChips = $("farmChips");

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
  const partnerBox = $("partnerBox");
  const partnerImg = $("partnerImg");
  const partnerTitle = $("partnerTitle");
  const partnerName = $("partnerName");
  const partnerMeta = $("partnerMeta");
  const partnerLine = $("partnerLine");
  const partnerViewBtn = $("partnerViewBtn");
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
  let activeSub = null;
      activeFarm = null;
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
      const [cardsRes, subRes, farmsRes] = await Promise.all([
        fetch("/api/cards", { cache: "no-store" }),
        fetch("/api/subcategories", { cache: "no-store" }).catch(() => null),
        fetch("/api/farms", { cache: "no-store" }).catch(() => null),
      ]);

      if (!cardsRes.ok) throw new Error(`HTTP ${cardsRes.status}`);
      const data = await cardsRes.json();

      // subcategories / farms (optionnel)
      try {
        if (subRes && subRes.ok) subcategories = await subRes.json();
      } catch {}
      try {
        if (farmsRes && farmsRes.ok) farms = await farmsRes.json();
      } catch {}

      const subMap = new Map((Array.isArray(subcategories) ? subcategories : []).map((s) => [Number(s.id), s]));
      const farmMap = new Map((Array.isArray(farms) ? farms : []).map((f) => [Number(f.id), f]));

      const mapped = (Array.isArray(data) ? data : []).map((c) => {
        const subId = c.subcategory_id != null ? Number(c.subcategory_id) : null;
        const farmId = c.farm_id != null ? Number(c.farm_id) : null;

        const sub = subId ? subMap.get(subId) : null;
        const farm = farmId ? farmMap.get(farmId) : null;

        return {
          id: Number(c.id) || c.id,
          name: c.name || "Sans nom",
          type: c.type || "hash",
          micron: c.micron ? String(c.micron) : "",
          weed_kind: c.weed_kind ? String(c.weed_kind) : "",
          thc: c.thc || "—",
          description: c.description || c.desc || "—",
          img: c.img || "",
          advice: c.advice || "",
          terpenes: Array.isArray(c.terpenes) ? c.terpenes : [],
          aroma: Array.isArray(c.aroma) ? c.aroma : [],
          effects: Array.isArray(c.effects) ? c.effects : [],
          subcategory_id: subId,
          subcategory_label: c.subcategory_label || sub?.label || null,
          farm_id: farmId,
          farm_name: c.farm_name || farm?.name || null,
          is_featured: !!c.is_featured,
          featured_title: c.featured_title || "",
          is_partner: !!c.is_partner,
          partner_title: c.partner_title || "",
          season: c.season || null,
        };
      });

      cards = mapped;
      renderEverything();
    } catch (e) {
      console.error("loadCards:", e);
      toast("Erreur de chargement des fiches.");
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

      const subMap = new Map((Array.isArray(subcategories) ? subcategories : []).map((s) => [Number(s.id), s]));
      const farmMap = new Map((Array.isArray(farms) ? farms : []).map((f) => [Number(f.id), f]));

      const subId = c.subcategory_id != null ? Number(c.subcategory_id) : null;
      const farmId = c.farm_id != null ? Number(c.farm_id) : null;

      featured = {
        id: Number(c.id) || c.id,
        name: c.name || "Sans nom",
        type: c.type || "hash",
        micron: c.micron ? String(c.micron) : "",
        weed_kind: c.weed_kind ? String(c.weed_kind) : "",
        thc: c.thc || "—",
        description: c.description || c.desc || "—",
        img: c.img || "",
        subcategory_id: subId,
        subcategory_label: c.subcategory_label || subMap.get(subId)?.label || null,
        farm_id: farmId,
        farm_name: c.farm_name || farmMap.get(farmId)?.name || null,
        featured_title: c.featured_title || "✨ Légendaire du moment",
      };

      renderFeatured();
    renderPartnerBox();
    } catch (e) {
      featured = null;
      if (featuredBox) featuredBox.style.display = "none";
    }
  }

  async function loadPartner() {
    try {
      const res = await fetch("/api/partner", { cache: "no-store" });
      if (!res.ok) {
        partner = null;
        if (partnerBox) partnerBox.style.display = "none";
        return;
      }
      const c = await res.json();
      if (!c) {
        partner = null;
        if (partnerBox) partnerBox.style.display = "none";
        return;
      }

      const subMap = new Map((Array.isArray(subcategories) ? subcategories : []).map((s) => [Number(s.id), s]));
      const farmMap = new Map((Array.isArray(farms) ? farms : []).map((f) => [Number(f.id), f]));

      const subId = c.subcategory_id != null ? Number(c.subcategory_id) : null;
      const farmId = c.farm_id != null ? Number(c.farm_id) : null;

      partner = {
        id: Number(c.id) || c.id,
        name: c.name || "Sans nom",
        type: c.type || "hash",
        micron: c.micron ? String(c.micron) : "",
        weed_kind: c.weed_kind ? String(c.weed_kind) : "",
        thc: c.thc || "—",
        description: c.description || c.desc || "—",
        img: c.img || "",
        subcategory_id: subId,
        subcategory_label: c.subcategory_label || subMap.get(subId)?.label || null,
        farm_id: farmId,
        farm_name: c.farm_name || farmMap.get(farmId)?.name || null,
        partner_title: c.partner_title || "🤝 Partenaire du moment",
      };

      renderPartnerBox();
    } catch {
      partner = null;
      if (partnerBox) partnerBox.style.display = "none";
    }
  }

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

  function renderPartnerBox() {
    if (!partnerBox) return;
    if (!partner) {
      partnerBox.style.display = "none";
      return;
    }

    partnerBox.style.display = "block";
    if (partnerImg) partnerImg.src = partner.img || "";
    if (partnerTitle) partnerTitle.textContent = partner.partner_title || "🤝 Partenaire du moment";
    if (partnerName) partnerName.textContent = partner.name || "—";

    const metaBits = [];
    metaBits.push(typeLabel(partner.type));
    if (partner.subcategory_label) metaBits.push(partner.subcategory_label);
    if (partner.type === "weed" && partner.weed_kind) metaBits.push(weedKindLabel(partner.weed_kind));
    if (partner.type !== "weed" && partner.micron) metaBits.push(partner.micron);
    if (partner.farm_name) metaBits.push(`Farm: ${partner.farm_name}`);

    if (partnerMeta) partnerMeta.textContent = metaBits.join(" • ");
    if (partnerLine) partnerLine.textContent = partner.thc || "—";

    if (partnerViewBtn) {
      partnerViewBtn.onclick = () => openDetails(partner.id);
    }
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
      activeSub = null;
      subChips.style.display = "none";
    } else {
      subChips.style.display = "flex";

      const relevant = (Array.isArray(subcategories) ? subcategories : []).filter((s) => s.type === activeType);
      // Compter les cartes par subcat
      const counts = new Map();
      for (const c of cards) {
        if (String(c.type) !== activeType) continue;
        const sid = c.subcategory_id != null ? Number(c.subcategory_id) : null;
        if (!sid) continue;
        counts.set(sid, (counts.get(sid) || 0) + 1);
      }

      // Chip "Toutes"
      subChips.appendChild(
        mkChip("Toutes", activeSub === null, () => {
          activeSub = null;
          renderEverything();
        })
      );

      // Chips subcats
      for (const s of relevant) {
        const sid = Number(s.id);
        const n = counts.get(sid) || 0;
        // Afficher aussi si pas de cartes, mais en discret
        subChips.appendChild(
          mkChip(`${s.label}${n ? ` (${n})` : ""}`, activeSub === sid, () => {
            activeSub = sid;
            renderEverything();
          }, { disabled: !n })
        );
      }
    }

    // Farms chips
    if (!farmChips) return;
    farmChips.innerHTML = "";

    const farmCounts = new Map();
    for (const c of cards) {
      const fid = c.farm_id != null ? Number(c.farm_id) : null;
      if (!fid) continue;
      farmCounts.set(fid, (farmCounts.get(fid) || 0) + 1);
    }

    const farmsList = Array.isArray(farms) ? farms : [];
    if (!farmsList.length) {
      activeFarm = null;
      farmChips.style.display = "none";
      return;
    }

    farmChips.style.display = "flex";

    farmChips.appendChild(
      mkChip("Toutes farms", activeFarm === null, () => {
        activeFarm = null;
        renderEverything();
      })
    );

    for (const f of farmsList) {
      const fid = Number(f.id);
      const n = farmCounts.get(fid) || 0;
      farmChips.appendChild(
        mkChip(`${f.name}${n ? ` (${n})` : ""}`, activeFarm === fid, () => {
          activeFarm = fid;
          renderEverything();
        }, { disabled: !n })
      );
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

  function subMatch(card) {
    if (activeType === "all") return true;
    if (activeSub === null) return true;
    return Number(card.subcategory_id || 0) === Number(activeSub);
  }

  function farmMatch(card) {
    if (activeFarm === null) return true;
    return Number(card.farm_id || 0) === Number(activeFarm);
  }

  function favMatch(card) {
    if (!showFavOnly) return true;
    return favs.has(String(card.id));
  }

  function sorted(arr) {
    const copy = [...arr];
    if (sortMode === "az") {
      copy.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
    } else if (sortMode === "thc") {
      copy.sort((a, b) => parseThcScore(b.thc) - parseThcScore(a.thc));
    } else {
      // "new": plus grand id en premier (simple et efficace)
      copy.sort((a, b) => Number(b.id) - Number(a.id));
    }
    return copy;
  }

  function filteredList() {
    const q = norm(searchInput.value);
    const base = pokedex.filter((p) => {
      const typeOk = activeType === "all" || norm(p.type) === activeType;
      return typeOk && subMatch(p) && farmMatch(p) && favMatch(p) && matchesQuery(p, q);
    });
    return sorted(base);
  }

  /* ================= RENDER LIST ================= */
  function updateBadges(itemsCount) {
    countBadge.textContent = itemsCount;
    if (favBadge) favBadge.textContent = `❤️ ${favs.size}`;
    if (favToggle) favToggle.classList.toggle("active", showFavOnly);
  }

  function renderList() {
    const items = filteredList();
    updateBadges(items.length);
    listEl.innerHTML = "";

    if (!items.length) {
      listEl.innerHTML = `<div class="text-secondary p-2">Aucun résultat…</div>`;
      return;
    }

    items.forEach((p) => {
      const btn = document.createElement("button");
      btn.className =
        "list-group-item list-group-item-action bg-black text-white border-secondary d-flex align-items-center gap-2 rounded-3 mb-2";

      const extra = extraText(p);

      const isShiny = featured && String(p.id) === String(featured.id);
      const shinyBadge = isShiny
        ? `<span class="badge text-bg-warning text-dark" style="margin-left:6px;">✨ SHINY</span>`
        : "";

      const isFav = favs.has(String(p.id));
      const favMark = isFav
        ? `<span class="badge text-bg-danger" style="margin-left:6px;">❤️</span>`
        : "";

      btn.innerHTML = `
        <img src="${p.img}" width="40" height="40" style="object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.10);" />
        <div class="flex-grow-1 text-start">
          <div class="fw-semibold">${p.name} ${shinyBadge} ${favMark}</div>
          <div class="small text-secondary">#${p.id} • ${typeLabel(p.type)}${extra}${p.subcategory_label ? ` • ${p.subcategory_label}` : ``}${p.farm_name ? ` • 🌾 ${p.farm_name}` : ``}</div>
        </div>
        <span class="badge text-bg-danger">Voir</span>
      `;

      btn.onclick = () => {
        selectCard(p);
        haptic("impact", "light");
      };
      listEl.appendChild(btn);
    });
  }

  /* ================= SELECT ================= */
  function refreshFavBtn() {
    if (!favBtn || !selected) return;
    const isFav = favs.has(String(selected.id));
    favBtn.textContent = isFav ? "✅ Dans tes favoris" : "❤️ Ajouter aux favoris";
    favBtn.className = isFav ? "btn btn-sm btn-warning w-100" : "btn btn-sm btn-outline-warning w-100";
  }

  function selectCard(p) {
    selected = p;

    if (pokeName) pokeName.textContent = p.name;
    if (pokeId) pokeId.textContent = `#${p.id}`;
    if (pokeType) {
      const bits = [`${typeLabel(p.type)}${extraText(p)}`];
      if (p.subcategory_label) bits.push(p.subcategory_label);
      if (p.farm_name) bits.push(`🌾 ${p.farm_name}`);
      pokeType.textContent = bits.join(" • ");
    }
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

    refreshFavBtn();
  }

  /* ================= EVENTS ================= */
  searchInput.oninput = renderList;

  clearBtn?.addEventListener("click", () => {
    searchInput.value = "";
    renderList();
    toast("Recherche effacée");
  });

  document.querySelectorAll(".chip[data-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".chip[data-type]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      activeType = btn.dataset.type;
      activeSub = null;
      activeFarm = null;
      renderSubChips();
      renderList();
      haptic("impact", "light");
    });
  });

  sortSelect?.addEventListener("change", () => {
    sortMode = sortSelect.value;
    renderList();
    toast(sortMode === "az" ? "Tri: A–Z" : sortMode === "thc" ? "Tri: THC haut" : "Tri: Nouveau");
  });

  favToggle?.addEventListener("click", () => {
    showFavOnly = !showFavOnly;
    renderList();
    toast(showFavOnly ? "Mode Favoris ❤️" : "Mode Normal");
    haptic("impact", "medium");
  });

  favBtn?.addEventListener("click", () => {
    if (!selected) return;
    const id = String(selected.id);
    if (favs.has(id)) {
      favs.delete(id);
      toast("Retiré des favoris");
    } else {
      favs.add(id);
      toast("Ajouté aux favoris ❤️");
    }
    saveFavs(favs);
    refreshFavBtn();
    renderList();
    haptic("impact", "medium");
  });

  randomBtn?.addEventListener("click", () => {
    const items = filteredList();
    if (!items.length) return;

    // fun: 15% chance d’aller sur la rare
    if (featured && Math.random() < 0.15) {
      selectCard(featured);
      toast("✨ Random → Rare !");
      return;
    }

    selectCard(items[Math.floor(Math.random() * items.length)]);
    toast("🎲 Random !");
  });

  shareBtn?.addEventListener("click", async () => {
    if (!selected) return;

    const shareText =
      `🧬 ${selected.name} (#${selected.id})\n` +
      `Catégorie: ${typeLabel(selected.type)}${extraText(selected)}\n` +
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

    try { await navigator.clipboard?.writeText(shareText); } catch {}

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

  themeBtn?.addEventListener("click", toggleTheme);

  /* ================= INIT ================= */
  (async () => {
    applyThemeFromStorage();
    setLoading(true);

    await loadCards();
    await loadFeatured();
    await loadPartner();

    renderSubChips();
    renderList();

    setLoading(false);

    // si featured existe, petit “wow”
    if (featured) {
      toast("✨ Shiny du moment chargé");
    }
  })();
})();
