(() => {
  const tg = window.Telegram?.WebApp;
  if (tg) { try { tg.ready(); tg.expand(); } catch {} }

  const $ = id => document.getElementById(id);
  const norm = v => (v ?? "").toString().toLowerCase();

  let cards = [];
  let activeType = "all";
  let activeSub = "all";
  let selected = null;

  /* ================= API ================= */
  async function loadCards() {
    const res = await fetch("/api/cards");
    cards = await res.json();
  }

  async function loadFeatured() {
    const res = await fetch("/api/featured");
    if (!res.ok) return;
    const c = await res.json();
    if (!c) return;

    $("featuredBox").style.display = "block";
    $("featuredImg").src = c.img;
    $("featuredName").textContent = c.name;
    $("featuredMeta").textContent = `${c.type} • ${c.thc}`;
    $("featuredViewBtn").onclick = () => selectCard(c);
  }

  /* ================= SECTIONS ================= */
  function miniCard(c) {
    const d = document.createElement("div");
    d.className = "border border-secondary rounded p-2";
    d.style.minWidth = "180px";
    d.innerHTML = `
      <div class="fw-bold">${c.name}</div>
      <div class="text-secondary small">${c.type}</div>
    `;
    d.onclick = () => selectCard(c);
    return d;
  }

  function renderSections() {
    $("trendRow").innerHTML = "";
    $("newRow").innerHTML = "";
    $("popularRow").innerHTML = "";

    cards.slice(0, 8).forEach(c => {
      $("trendRow").appendChild(miniCard(c));
      $("newRow").appendChild(miniCard(c));
      $("popularRow").appendChild(miniCard(c));
    });
  }

  /* ================= LIST ================= */
  function renderList() {
    const list = $("list");
    list.innerHTML = "";

    cards
      .filter(c => activeType === "all" || c.type === activeType)
      .filter(c => norm(c.name).includes(norm($("searchInput").value)))
      .forEach(c => {
        const btn = document.createElement("button");
        btn.className = "list-group-item bg-black text-white";
        btn.textContent = `${c.name} (#${c.id})`;
        btn.onclick = () => selectCard(c);
        list.appendChild(btn);
      });
  }

  /* ================= DETAILS ================= */
  function selectCard(c) {
    selected = c;
    $("pokeName").textContent = c.name;
    $("pokeType").textContent = c.type;
    $("pokeThc").textContent = c.thc;
    $("pokeDesc").textContent = c.description || c.desc || "—";
  }

  /* ================= EVENTS ================= */
  document.querySelectorAll(".chip").forEach(b => {
    b.onclick = () => {
      document.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      activeType = b.dataset.type;
      renderList();
    };
  });

  $("searchInput").oninput = renderList;

  /* ================= INIT ================= */
  async function init() {
    await loadCards();
    await loadFeatured();
    renderSections();
    renderList();
    if (cards.length) selectCard(cards[0]);
  }

  init();
})();
