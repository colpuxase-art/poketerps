(() => {
  /* ================= TELEGRAM ================= */
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  /* ================= DATA (loaded from API) ================= */
  let pokedex = [];

  async function loadCards() {
    try {
      const res = await fetch("/api/cards", { cache: "no-store" });
      const data = await res.json();
      pokedex = Array.isArray(data) ? data : [];
    } catch (e) {
      pokedex = [];
      console.error("❌ Impossible de charger /api/cards", e);
    }
  }

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
      (!q || String(p.name || "").toLowerCase().includes(q))
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

      const img = p.img || "https://i.imgur.com/0HqWQvH.png";

      btn.innerHTML = `
        <img src="${img}" width="40" height="40" />
        <div class="flex-grow-1 text-start">
          <div class="fw-semibold">${p.name || "Sans nom"}</div>
          <div class="small text-secondary">#${p.id ?? "—"} • ${typeLabel(p.type)}</div>
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

    if (pokeName) pokeName.textContent = p.name || "Sans nom";
    if (pokeId) pokeId.textContent = `#${p.id ?? "—"}`;
    if (pokeType) pokeType.textContent = typeLabel(p.type);
    if (pokeThc) pokeThc.textContent = p.thc || "—";

    if (pokeDesc) {
      const line1 = `🧬 Profil: ${p.desc || "—"}`;
      const line2 = `🌿 Terpènes: ${formatList(p.terpenes)}`;
      const line3 = `👃 Arômes: ${formatList(p.aroma)}`;
      const line4 = `🧠 Effets (ressenti): ${formatList(p.effects)}`;
      const line5 = `⚠️ Conseils: ${p.advice || "—"}`;

      pokeDesc.textContent = [line1, "", line2, line3, line4, "", line5].join("\n");
    }

    if (pokeImg) {
      pokeImg.src = p.img || "https://i.imgur.com/0HqWQvH.png";
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
    selectCard(items[Math.floor(Math.random() * items.length)]);
  });

  shareBtn?.addEventListener("click", async () => {
    if (!selected) return;

    const shareText =
      `🧬 ${selected.name} (#${selected.id})\n` +
      `Catégorie: ${typeLabel(selected.type)}\n` +
      `${selected.thc || ""}\n\n` +
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
    renderList();
  })();
})();
