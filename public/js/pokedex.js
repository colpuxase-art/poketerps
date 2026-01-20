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
    // compat: API peut renvoyer desc OU description
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

  // 👇 conteneur sub-chips (on le crée si absent)
  let subchipsEl = $("subchips");

  if (!listEl || !countBadge || !searchInput) {
    console.error("❌ IDs HTML manquants (list, countBadge, searchInput)");
    return;
  }

  /* ================= STATE ================= */
  let activeType = "all";     // all|hash|weed|extraction|wpff
  let activeSub = "all";      // all|120u|90u|73u|45u|none  OU all|indica|sativa|hybrid
  let selected = null;
  let pokedex = []; // sera rempli par l’API

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
        weed_kind: c.weed_kind ?? null, // ✅ IMPORTANT
        thc: c.thc || "—",
        desc: cardDesc(c),
        img: c.img || "https://i.imgur.com/0HqWQvH.png",
        terpenes: Array.isArray(c.terpenes) ? c.terpenes : [],
        aroma: Array.isArray(c.aroma) ? c.aroma : [],
        effects: Array.isArray(c.effects) ? c.effects : [],
        advice: c.advice || "Info éducative. Les effets varient selon la personne. Respecte la loi.",
      }));

      if (!mapped.length) {
        console.warn("⚠️ API OK mais aucune fiche. Fallback activé.");
        pokedex = fallbackPokedex;
      } else {
        pokedex = mapped;
      }
    } catch (e) {
      console.error("❌ Impossible de charger /api/cards :", e);
      pokedex = fallbackPokedex;
    }
  }

  /* ================= SUBCHIPS UI ================= */
  function ensureSubchipsContainer() {
    if (subchipsEl) return subchipsEl;

    // essaie de l’injecter juste après la rangée de chips principale
    // on cherche le parent des boutons .chip existants
    const mainChips = document.querySelector(".chip")?.closest(".d-flex");
    if (mainChips && mainChips.parentElement) {
      const wrap = document.createElement("div");
      wrap.id = "subchips";
      wrap.className = "mt-2 d-flex flex-wrap gap-2";
      mainChips.parentElement.appendChild(wrap);
      subchipsEl = wrap;
      return subchipsEl;
    }

    // sinon on l’ajoute en haut
    const fallback = document.createElement("div");
    fallback.id = "subchips";
    fallback.className = "mt-2 d-flex flex-wrap gap-2";
    document.body.prepend(fallback);
    subchipsEl = fallback;
    return subchipsEl;
  }

  function subchipsConfigForType(t) {
    if (t === "weed") {
      return [
        { key: "all", label: "Tous" },
        { key: "indica", label: "Indica" },
        { key: "sativa", label: "Sativa" },
        { key: "hybrid", label: "Hybrid" },
      ];
    }
    if (t === "hash" || t === "extraction" || t === "wpff") {
      return [
        { key: "all", label: "Tous" },
        { key: "120u", label: "120u" },
        { key: "90u", label: "90u" },
        { key: "73u", label: "73u" },
        { key: "45u", label: "45u" },
        { key: "none", label: "Aucun" },
      ];
    }
    return null; // all => pas de subchips
  }

  function renderSubchips() {
    const wrap = ensureSubchipsContainer();
    const cfg = subchipsConfigForType(activeType);

    // si "all" => on cache
    if (!cfg) {
      wrap.innerHTML = "";
      wrap.style.display = "none";
      activeSub = "all";
      return;
    }

    wrap.style.display = "flex";
    wrap.innerHTML = "";

    cfg.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-sm btn-outline-light chip-sub";
      btn.dataset.sub = c.key;
      btn.textContent = c.label;

      if (activeSub === c.key) {
        btn.classList.add("active");
        btn.classList.remove("btn-outline-light");
        btn.classList.add("btn-danger");
      }

      btn.addEventListener("click", () => {
        activeSub = c.key;
        renderSubchips();
        renderList();
      });

      wrap.appendChild(btn);
    });
  }

  function resetSubFilterForType() {
    activeSub = "all";
    renderSubchips();
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

  function matchesSubFilter(card) {
    if (activeType === "all") return true;
    if (activeSub === "all") return true;

    if (activeType === "weed") {
      // weed_kind filter
      return norm(card.weed_kind) === activeSub;
    }

    // micron filter (hash/extraction/wpff)
    if (activeSub === "none") {
      return !norm(card.micron);
    }
    return norm(card.micron) === activeSub;
  }

  function filteredList() {
    const q = norm(searchInput.value);
    return pokedex.filter((p) => {
      const typeOk = activeType === "all" || p.type === activeType;
      return typeOk && matchesSubFilter(p) && matchesQuery(p, q);
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

      const extra =
        p.type === "weed"
          ? p.weed_kind
            ? ` • ${weedKindLabel(norm(p.weed_kind))}`
            : ""
          : p.micron
            ? ` • ${p.micron}`
            : "";

      btn.innerHTML = `
        <img src="${p.img}" width="40" height="40" style="object-fit:cover;border-radius:8px;" />
        <div class="flex-grow-1 text-start">
          <div class="fw-semibold">${p.name}</div>
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

    const extra =
      p.type === "weed"
        ? p.weed_kind
          ? ` • ${weedKindLabel(norm(p.weed_kind))}`
          : ""
        : p.micron
          ? ` • ${p.micron}`
          : "";

    if (pokeType) pokeType.textContent = `${typeLabel(p.type)}${extra}`;
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

  // chips principales (type)
  document.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeType = btn.dataset.type;

      // reset subfilter quand on change de type
      resetSubFilterForType();

      renderList();
    });
  });

  randomBtn?.addEventListener("click", () => {
    const items = filteredList();
    if (!items.length) return;
    selectCard(items[Math.floor(Math.random() * items.length)]);
  });

  shareBtn?.addEventListener("click", async () => {
    if (!selected) return;

    const extra =
      selected.type === "weed"
        ? selected.weed_kind
          ? ` • ${weedKindLabel(norm(selected.weed_kind))}`
          : ""
        : selected.micron
          ? ` • ${selected.micron}`
          : "";

    const shareText =
      `🧬 ${selected.name} (#${selected.id})\n` +
      `Catégorie: ${typeLabel(selected.type)}${extra}\n` +
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
    renderSubchips(); // important: cache si all
    renderList();
  })();
})();
