(() => {
  /* ================= TELEGRAM ================= */
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  /* ================= DATA (HASH / WEED / EXTRACTION / WPFF) ================= */
  // ⚠️ Les valeurs THC/effets sont indicatives. À adapter selon tes fiches.
  const pokedex = [
    // ===== HASH =====
    {
      id: 101,
      name: "Static Hash (exemple)",
      type: "hash",
      thc: "THC: 35–55% (exemple)",
      desc: "Hash sec, texture sableuse, très parfumé.",
      img: "https://i.imgur.com/0HqWQvH.png",
      terpenes: ["Myrcene", "Caryophyllene"],
      aroma: ["Terreux", "Épicé", "Boisé"],
      effects: ["Relax (ressenti)", "Calme (ressenti)"],
      advice: "Commence bas. Évite de mélanger. Respecte la législation."
    },
    {
      id: 102,
      name: "Dry Sift (exemple)",
      type: "hash",
      thc: "THC: 30–50% (exemple)",
      desc: "Tamisage à sec, rendu 'kief' pressé ou non.",
      img: "https://i.imgur.com/0HqWQvH.png",
      terpenes: ["Pinene", "Limonene"],
      aroma: ["Frais", "Pin", "Agrumes"],
      effects: ["Équilibré (ressenti)"],
      advice: "Prends ton temps. Hydrate-toi."
    },

    // ===== WEED =====
    {
      id: 201,
      name: "Gelato (exemple)",
      type: "weed",
      thc: "THC: 20–26% (exemple)",
      desc: "Profil sucré/crémeux, populaire.",
      img: "https://i.imgur.com/0HqWQvH.png",
      terpenes: ["Limonene", "Caryophyllene", "Myrcene"],
      aroma: ["Sucré", "Crémeux", "Agrumes"],
      effects: ["Relax (ressenti)", "Bonne humeur (ressenti)"],
      advice: "Évite de conduire. Ne mélange pas. Respecte les lois."
    },
    {
      id: 202,
      name: "Blue Dream (exemple)",
      type: "weed",
      thc: "THC: 18–24% (exemple)",
      desc: "Profil fruité + pin, souvent décrit équilibré.",
      img: "https://i.imgur.com/0HqWQvH.png",
      terpenes: ["Myrcene", "Pinene", "Caryophyllene"],
      aroma: ["Fruité", "Pin", "Sucré léger"],
      effects: ["Équilibré (ressenti)", "Créatif (ressenti)"],
      advice: "Commence bas, attends 10–15 min. Hydrate-toi."
    },

    // ===== EXTRACTION =====
    {
      id: 301,
      name: "Rosin (exemple)",
      type: "extraction",
      thc: "THC: 60–80% (exemple)",
      desc: "Extraction sans solvants (pression + chaleur).",
      img: "https://i.imgur.com/0HqWQvH.png",
      terpenes: ["Limonene", "Myrcene"],
      aroma: ["Très aromatique", "Fruité", "Frais"],
      effects: ["Puissant (ressenti)"],
      advice: "Très concentré: micro-dose recommandé. Attends avant de reprendre."
    },
    {
      id: 302,
      name: "BHO / Wax (exemple)",
      type: "extraction",
      thc: "THC: 70–90% (exemple)",
      desc: "Concentré très puissant (solvants).",
      img: "https://i.imgur.com/0HqWQvH.png",
      terpenes: ["Caryophyllene", "Pinene"],
      aroma: ["Épicé", "Pin", "Fort"],
      effects: ["Très puissant (ressenti)"],
      advice: "Info éducative. Risques accrus si surdosage. Ne mélange pas."
    },

    // ===== WPFF =====
    {
      id: 401,
      name: "WPFF Rosin (exemple)",
      type: "wpff",
      thc: "THC: 60–80% (exemple)",
      desc: "WPFF = Whole Plant Fresh Frozen. Profil terpénique souvent 'ultra fresh'.",
      img: "https://i.imgur.com/0HqWQvH.png",
      terpenes: ["Limonene", "Pinene", "Myrcene"],
      aroma: ["Frais", "Vivant", "Agrumes"],
      effects: ["Très aromatique (ressenti)", "Puissant (ressenti)"],
      advice: "Concentré: commence très bas. Attends 10–15 min avant de reprendre."
    }
  ];

  /* ================= HELPERS ================= */
  const $ = (id) => document.getElementById(id);

  const typeLabel = (t) =>
    ({ hash: "Hash", weed: "Weed", extraction: "Extraction", wpff: "WPFF" }[t] || t);

  const formatList = (arr) => (Array.isArray(arr) && arr.length ? arr.join(", ") : "—");

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

  if (!listEl || !countBadge || !searchInput) {
    console.error("❌ IDs HTML manquants (list, countBadge, searchInput)");
    return;
  }

  /* ================= STATE ================= */
  let activeType = "all";
  let selected = null;

  /* ================= FILTERS ================= */
  function filteredList() {
    const q = searchInput.value.trim().toLowerCase();
    return pokedex.filter((p) =>
      (activeType === "all" || p.type === activeType) &&
      (!q || p.name.toLowerCase().includes(q))
    );
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

      btn.innerHTML = `
        <img src="${p.img}" width="40" height="40" />
        <div class="flex-grow-1 text-start">
          <div class="fw-semibold">${p.name}</div>
          <div class="small text-secondary">#${p.id} • ${typeLabel(p.type)}</div>
        </div>
        <span class="badge text-bg-danger">Voir</span>
      `;

      btn.onclick = () => selectPokemon(p);
      listEl.appendChild(btn);
    });
  }

  /* ================= SELECT ================= */
  function selectPokemon(p) {
    selected = p;

    if (pokeName) pokeName.textContent = p.name;
    if (pokeId) pokeId.textContent = `#${p.id}`;
    if (pokeType) pokeType.textContent = typeLabel(p.type);
    if (pokeThc) pokeThc.textContent = p.thc;

    if (pokeDesc) {
      const line1 = `🧬 Profil: ${p.desc || "—"}`;
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
    selectPokemon(items[Math.floor(Math.random() * items.length)]);
  });

  shareBtn?.addEventListener("click", async () => {
    if (!selected) return;

    const shareText =
      `🧬 ${selected.name} (#${selected.id})\n` +
      `Catégorie: ${typeLabel(selected.type)}\n` +
      `${selected.thc}\n\n` +
      `🌿 Terpènes: ${formatList(selected.terpenes)}\n` +
      `👃 Arômes: ${formatList(selected.aroma)}\n` +
      `🧠 Effets (ressenti): ${formatList(selected.effects)}\n\n` +
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
      buttons: [{ type: "ok" }]
    });
  });

  closeBtn?.addEventListener("click", () => {
    if (tg) tg.close();
    else window.close();
  });

  /* ================= INIT ================= */
  renderList();
})();
