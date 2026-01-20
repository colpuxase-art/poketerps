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

  const typeLabel = (t) =>
    ({ hash: "Hash", weed: "Weed", extraction: "Extraction", wpff: "WPFF" }[t] || t);

  const weedKindLabel = (k) =>
    ({ indica: "Indica", sativa: "Sativa", hybrid: "Hybrid" }[k] || k);

  const formatList = (arr) => (Array.isArray(arr) && arr.length ? arr.join(", ") : "—");

  const safeStr = (v) => (v == null ? "" : String(v));
  const norm = (v) => safeStr(v).trim().toLowerCase();

  function cardDesc(c) {
    return c.desc ?? c.description ?? c.profile ?? "—";
  }

  /* ================= ELEMENTS ================= */
  const listEl = $("list");
  const countBadge = $("countBadge");
  const searchInput = $("searchInput");
  const clearBtn = $("clearBtn");
  const closeBtn = $("closeBtn");
  const randomBtn = $("randomBtn");
  const shareBtn = $("shareBtn");

  const subChips = $("subChips");

  const pokeName = $("pokeName");
  const pokeId = $("pokeId");
  const pokeImg = $("pokeImg");
  const placeholder = $("placeholder");
  const pokeType = $("pokeType");
  const pokeThc = $("pokeThc");
  const pokeDesc = $("pokeDesc");

  // ✅ skeletons
  const listSkeleton = $("listSkeleton");
  const detailsSkeleton = $("detailsSkeleton");
  const detailsReal = $("detailsReal");

  // ✅ FEATURED UI
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
    console.error("❌ IDs HTML manquants (list, countBadge, searchInput)");
    return;
  }

  /* ================= STATE ================= */
  let activeType = "all";
  let activeSub = "all";
  let selected = null;
  let pokedex = [];
  let featured = null;

  const micronValues = ["120u", "90u", "73u", "45u"];
  const weedKindValues = ["indica", "sativa", "hybrid"];

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
      console.error("❌ Impossible de charger /api/cards :", e);
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
    } catch (e) {
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
      { top: "16%", left: "10%", d: 0.0 },
      { top: "28%", left: "24%", d: 0.4 },
      { top: "12%", left: "52%", d: 0.2 },
      { top: "36%", left: "62%", d: 0.6 },
      { top: "18%", left: "84%", d: 0.1 },
      { top: "62%", left: "14%", d: 0.5 },
      { top: "70%", left: "46%", d: 0.3 },
      { top: "64%", left: "78%", d: 0.7 },
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

  /* ================= FEATURED RENDER ================= */
  function renderFeatured() {
    if (!featuredBox || !featured) return;
    featuredBox.style.display = "block";

    if (featuredImg) featuredImg.src = featured.img;
    if (featuredTitle) featuredTitle.textContent = featured.featured_title || "✨ Shiny du moment";
    if (featuredName) featuredName.textContent = featured.name;
    if (featuredMeta)
      featuredMeta.textContent = `#${featured.id} • ${typeLabel(featured.type)}${extraText(featured)}`;
    if (featuredLine) featuredLine.textContent = `🧬 ${cardDesc(featured)}`;

    // ✅ compteur rare
    try {
      const total = pokedex.length || 0;
      const pos = total ? (pokedex.findIndex((x) => String(x.id) === String(featured.id)) + 1) : 0;
      if (featuredCount && total) {
        featuredCount.style.display = "inline-block";
        featuredCount.textContent = `Rare #${pos || 1}/${total}`;
      }
    } catch {}

    // ✅ sparkles
    makeSparkles();

    featuredViewBtn?.addEventListener("click", () => {
      selectCard(featured);
      document.getElementById("pokeName")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

    let options = [];
    if (activeType === "weed") {
      options = [
        { label: "Tous", value: "all" },
        { label: "Indica", value: "indica" },
        { label: "Sativa", value: "sativa" },
        { label: "Hybrid", value: "hybrid" },
      ];
      if (activeSub !== "all" && !weedKindValues.includes(activeSub)) activeSub = "all";
    } else {
      options = [
        { label: "Tous", value: "all" },
        { label: "120u", value: "120u" },
        { label: "90u", value: "90u" },
        { label: "73u", value: "73u" },
        { label: "45u", value: "45u" },
      ];
      if (activeSub !== "all" && !micronValues.includes(activeSub)) activeSub = "all";
    }

    options.forEach((opt) => {
      const btn = chipBtn(opt.label, opt.value, activeSub === opt.value);
      btn.addEventListener("click", () => {
        activeSub = opt.value;
        renderSubChips();
        renderList();
      });
      subChips.appendChild(btn);
    });
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
    ]
      .map((x) => norm(x))
      .join(" ");

    return hay.includes(q);
  }

  function subMatch(card) {
    if (activeType === "all" || activeSub === "all") return true;

    const t = norm(card.type);
    if (t === "weed") return norm(card.weed_kind) === activeSub;
    return norm(card.micron) === activeSub;
  }

  function filteredList() {
    const q = norm(searchInput.value);

    return pokedex.filter((p) => {
      const typeOk = activeType === "all" || norm(p.type) === activeType;
      return typeOk && subMatch(p) && matchesQuery(p, q);
    });
  }

  /* ================= RENDER LIST ================= */
  function renderList() {
    const items = filteredList();
    countBadge.textContent = items.length;
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

      // ✅ shiny badge si c’est la fiche du moment
      const shinyBadge =
        featured && String(p.id) === String(featured.id)
          ? `<span class="badge text-bg-warning" style="margin-left:6px;">✨ SHINY</span>`
          : "";

      btn.innerHTML = `
        <img src="${p.img}" width="40" height="40" style="object-fit:cover;border-radius:8px;" />
        <div class="flex-grow-1 text-start">
          <div class="fw-semibold">${p.name} ${shinyBadge}</div>
          <div class="small text-secondary">#${p.id} • ${typeLabel(p.type)}${extra}</div>
        </div>
        <span class="badge text-bg-danger">Voir</span>
      `;

      btn.onclick = () => selectCard(p);
      listEl.appendChild(btn);
    });
  }

  /* ================= SELECT ================= */
  function selectCard(p) {
    selected = p;

    if (pokeName) pokeName.textContent = p.name;
    if (pokeId) pokeId.textContent = `#${p.id}`;

    if (pokeType) pokeType.textContent = `${typeLabel(p.type)}${extraText(p)}`;
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
  }

  /* ================= EVENTS ================= */
  searchInput.oninput = renderList;

  clearBtn?.addEventListener("click", () => {
    searchInput.value = "";
    renderList();
  });

  document.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      activeType = btn.dataset.type;
      activeSub = "all";
      renderSubChips();
      renderList();
    });
  });

  randomBtn?.addEventListener("click", () => {
    const items = filteredList();
    if (!items.length) return;

    // ✅ fun: 12% chance d’aller sur la rare
    if (featured && Math.random() < 0.12) return selectCard(featured);

    selectCard(items[Math.floor(Math.random() * items.length)]);
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
    setLoading(true);
    await loadCards();
    await loadFeatured();
    renderSubChips();
    renderList();
    setLoading(false);
  })();
})();
