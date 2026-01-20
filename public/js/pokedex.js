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

  const pokeName = $("pokeName");
  const pokeId = $("pokeId");
  const pokeImg = $("pokeImg");
  const placeholder = $("placeholder");
  const pokeType = $("pokeType");
  const pokeThc = $("pokeThc");
  const pokeDesc = $("pokeDesc");

  // ✅ FEATURED UI
  const featuredBox = $("featuredBox");
  const featuredImg = $("featuredImg");
  const featuredTitle = $("featuredTitle");
  const featuredName = $("featuredName");
  const featuredMeta = $("featuredMeta");
  const featuredLine = $("featuredLine");
  const featuredViewBtn = $("featuredViewBtn");

  if (!listEl || !countBadge || !searchInput) {
    console.error("❌ IDs HTML manquants (list, countBadge, searchInput)");
    return;
  }

  /* ================= STATE ================= */
  let activeType = "all";
  let selected = null;
  let pokedex = [];
  let featured = null;

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
    // ✅ si endpoint pas dispo, on ignore
    try {
      const res = await fetch("/api/featured", { cache: "no-store" });
      if (!res.ok) return;
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

  function renderFeatured() {
    if (!featuredBox || !featured) return;
    featuredBox.style.display = "block";

    const micronTxt = featured.micron ? ` • ${featured.micron}` : "";
    if (featuredImg) featuredImg.src = featured.img;
    if (featuredTitle) featuredTitle.textContent = featured.featured_title || "✨ Shiny du moment";
    if (featuredName) featuredName.textContent = featured.name;
    if (featuredMeta) featuredMeta.textContent = `#${featured.id} • ${typeLabel(featured.type)}${micronTxt}`;
    if (featuredLine) featuredLine.textContent = `🧬 ${cardDesc(featured)}`;

    featuredViewBtn?.addEventListener("click", () => {
      selectCard(featured);
      // petit confort : scroll vers détails
      document.getElementById("pokeName")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  /* ================= FILTERS ================= */
  function matchesQuery(card, q) {
    if (!q) return true;

    const hay = [
      card.name,
      card.type,
      card.micron,
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

  function filteredList() {
    const q = norm(searchInput.value);
    return pokedex.filter((p) => {
      const typeOk = activeType === "all" || p.type === activeType;
      return typeOk && matchesQuery(p, q);
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

      const micronTxt = p.micron ? ` • ${p.micron}` : "";

      btn.innerHTML = `
        <img src="${p.img}" width="40" height="40" style="object-fit:cover;border-radius:8px;" />
        <div class="flex-grow-1 text-start">
          <div class="fw-semibold">${p.name}</div>
          <div class="small text-secondary">#${p.id} • ${typeLabel(p.type)}${micronTxt}</div>
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
    if (pokeType) pokeType.textContent = `${typeLabel(p.type)}${p.micron ? " • " + p.micron : ""}`;
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
      renderList();
    });
  });

  randomBtn?.addEventListener("click", () => {
    const items = filteredList();
    if (!items.length) return;

    // ✅ petit fun: 12% chance d’aller sur la rare
    if (featured && Math.random() < 0.12) return selectCard(featured);

    selectCard(items[Math.floor(Math.random() * items.length)]);
  });

  shareBtn?.addEventListener("click", async () => {
    if (!selected) return;

    const shareText =
      `🧬 ${selected.name} (#${selected.id})\n` +
      `Catégorie: ${typeLabel(selected.type)}${selected.micron ? " • " + selected.micron : ""}\n` +
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
    await loadCards();
    await loadFeatured();
    renderList();
  })();
})();
