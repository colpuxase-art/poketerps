(() => {
  /* ================= TELEGRAM ================= */
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  /* ================= DATA ================= */
  const pokedex = [
    {
      id: 1,
      name: "Bulbasaur",
      type: "grass",
      thc: "Info THC: usage responsable",
      desc: "Pokémon graine. Profil frais/herbacé.",
      img: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png"
    },
    {
      id: 4,
      name: "Charmander",
      type: "fire",
      thc: "Info THC: commence bas",
      desc: "Pokémon lézard. Profil chaud/épicé.",
      img: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png"
    },
    {
      id: 7,
      name: "Squirtle",
      type: "water",
      thc: "Info THC: hydrate-toi",
      desc: "Pokémon tortue. Profil frais/aquatique.",
      img: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/7.png"
    },
    {
      id: 25,
      name: "Pikachu",
      type: "electric",
      thc: "Info THC: évite de mélanger",
      desc: "Pokémon souris. Profil citronné/électrique.",
      img: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png"
    }
  ];

  /* ================= HELPERS ================= */
  const $ = (id) => document.getElementById(id);
  const typeLabel = (t) =>
    ({ grass: "Plante", fire: "Feu", water: "Eau", electric: "Électrik" }[t] || t);

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
    return pokedex.filter(p =>
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

    items.forEach(p => {
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
    pokeName.textContent = p.name;
    pokeId.textContent = `#${p.id}`;
    pokeType.textContent = typeLabel(p.type);
    pokeThc.textContent = p.thc;
    pokeDesc.textContent = p.desc;

    pokeImg.src = p.img;
    pokeImg.style.display = "inline-block";
    placeholder.style.display = "none";
  }

  /* ================= EVENTS ================= */
  searchInput.oninput = renderList;
  clearBtn.onclick = () => {
    searchInput.value = "";
    renderList();
  };

  document.querySelectorAll(".chip").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeType = btn.dataset.type;
      renderList();
    };
  });

  randomBtn?.addEventListener("click", () => {
    const items = filteredList();
    if (!items.length) return;
    selectPokemon(items[Math.floor(Math.random() * items.length)]);
  });

  shareBtn?.addEventListener("click", async () => {
    if (!selected) return;
    const text = `📘 ${selected.name} (#${selected.id})\n${selected.desc}`;
    try {
      await navigator.share?.({ text });
    } catch {}
    try {
      await navigator.clipboard?.writeText(text);
    } catch {}
    tg?.showPopup({
      title: "Partager",
      message: "Texte copié ✅",
      buttons: [{ type: "ok" }]
    });
  });

  closeBtn?.addEventListener("click", () => {
    tg?.close() || window.close();
  });

  /* ================= INIT ================= */
  renderList();
})();
