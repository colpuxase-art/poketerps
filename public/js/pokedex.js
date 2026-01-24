/* =========================================================
   HARVESTDEX — FRONT (REDESIGN + FIX VISIBILITY + RANDOM)
   ========================================================= */

const tg = window.Telegram?.WebApp;
tg?.ready?.();
tg?.expand?.();

let cards = [];
let seasons = [];
let favorites = new Set();
let showMyDex = false;
let selectedCard = null;

const el = (id) => document.getElementById(id);

const listEl = el("list");
const emptyEl = el("empty");
const toastEl = el("toast");

const tabDex = el("tab-dex");
const tabMyDex = el("tab-mydex");

const filterType = el("filter-type");
const filterSeason = el("filter-season");
const filterRarity = el("filter-rarity");
const searchEl = el("search");

const btnRefresh = el("btn-refresh");
const btnRandom = el("btn-random");

// detail
const sheet = el("detail");
const dImg = el("detail-img");
const dName = el("detail-name");
const dDesc = el("detail-desc");
const dThc = el("detail-thc");
const dTerp = el("detail-terp");
const dAroma = el("detail-aroma");
const dEffects = el("detail-effects");
const bType = el("badge-type");
const bSeason = el("badge-season");
const bRarity = el("badge-rarity");
const btnFav = el("btn-fav");
const btnShare = el("btn-share");
const btnClose = el("close-detail");

init();

async function init() {
  bindEvents();
  await bootstrap();
}

async function bootstrap() {
  try {
    toast("Chargement…");
    await Promise.all([loadSeasons(), loadCards()]);
    await loadFavorites();
    render();
    toast("");
  } catch (e) {
    console.error(e);
    toast("Erreur: impossible de charger les cartes. Ouvre /api/cards.");
    render();
  }
}

function bindEvents() {
  tabDex.onclick = () => {
    showMyDex = false;
    tabDex.classList.add("active");
    tabMyDex.classList.remove("active");
    render();
  };

  tabMyDex.onclick = () => {
    showMyDex = true;
    tabMyDex.classList.add("active");
    tabDex.classList.remove("active");
    render();
  };

  filterType.onchange = filterSeason.onchange = filterRarity.onchange = () => render();
  searchEl.oninput = () => render();

  btnRefresh.onclick = async () => {
    await bootstrap();
  };

  btnRandom.onclick = () => {
    const pool = getFiltered();
    if (!pool.length) return toast("Aucune carte à random.");
    const pick = pool[Math.floor(Math.random() * pool.length)];
    openDetail(pick);
  };

  btnClose.onclick = closeDetail;
  btnFav.onclick = toggleFavorite;
  btnShare.onclick = shareCard;

  sheet.addEventListener("click", (e) => {
    if (e.target === sheet) closeDetail();
  });
}

async function loadCards() {
  const res = await fetch("/api/cards", { cache: "no-store" });
  if (!res.ok) throw new Error(`/api/cards HTTP ${res.status}`);
  const data = await res.json();
  cards = Array.isArray(data) ? data : [];
}

async function loadSeasons() {
  const res = await fetch("/api/seasons", { cache: "no-store" });
  const data = await res.json();
  seasons = Array.isArray(data) ? data : [];

  filterSeason.innerHTML = `<option value="">Saison</option>`;
  for (const s of seasons) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.label;
    filterSeason.appendChild(opt);
  }
}

async function loadFavorites() {
  if (!tg?.initDataUnsafe?.user) return;
  const uid = tg.initDataUnsafe.user.id;
  const res = await fetch(`/api/mydex/${uid}`, { cache: "no-store" });
  const favCards = await res.json();
  favorites = new Set((Array.isArray(favCards) ? favCards : []).map((c) => String(c.id)));
}

function getFiltered() {
  const q = (searchEl.value || "").trim().toLowerCase();

  return cards.filter((c) => {
    if (showMyDex && !favorites.has(String(c.id))) return false;
    if (filterType.value && c.type !== filterType.value) return false;
    if (filterSeason.value && c.season !== filterSeason.value) return false;
    if (filterRarity.value && c.rarity !== filterRarity.value) return false;
    if (q) {
      const hay = `${c.name || ""} ${c.description || ""} ${(c.terpenes || []).join(" ")} ${(c.aroma || []).join(" ")} ${(c.effects || []).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function render() {
  listEl.innerHTML = "";

  const filtered = getFiltered();
  emptyEl.classList.toggle("hidden", filtered.length > 0);

  for (const c of filtered) {
    const card = document.createElement("div");
    card.className = "card";
    card.onclick = () => openDetail(c);

    card.innerHTML = `
      <div class="thumb">
        ${c.img ? `<img src="${escapeAttr(c.img)}" alt="">` : `<div style="height:120px;display:flex;align-items:center;justify-content:center;font-size:26px">🌾</div>`}
        <div class="shine"></div>
      </div>
      <div class="body">
        <div class="title">${escapeHtml(c.name || "")}</div>
        <div class="sub">
          <span class="badge">${escapeHtml(String((c.type || "").toUpperCase()))}</span>
          ${c.season ? `<span class="badge badge-season">${escapeHtml(c.season)}</span>` : ""}
          <span class="badge badge-rarity ${escapeHtml(c.rarity || "COMMON")}">${escapeHtml(c.rarity || "COMMON")}</span>
          ${favorites.has(String(c.id)) ? `<span class="badge heart">❤</span>` : ""}
        </div>
      </div>
    `;
    listEl.appendChild(card);
  }
}

function openDetail(c) {
  selectedCard = c;
  sheet.classList.remove("hidden");

  dImg.src = c.img || "";
  dName.textContent = c.name || "";
  dDesc.textContent = c.desc || c.description || "—";
  dThc.textContent = c.thc || "—";
  dTerp.textContent = (c.terpenes || []).join(", ") || "—";
  dAroma.textContent = (c.aroma || []).join(", ") || "—";
  dEffects.textContent = (c.effects || []).join(", ") || "—";

  bType.textContent = String(c.type || "").toUpperCase();
  bSeason.textContent = c.season || "";
  bRarity.textContent = c.rarity || "COMMON";
  bRarity.className = `badge badge-rarity ${c.rarity || "COMMON"}`;

  btnFav.textContent = favorites.has(String(c.id)) ? "💔 Retirer" : "❤️ Favori";
}

function closeDetail() {
  sheet.classList.add("hidden");
  selectedCard = null;
}

async function toggleFavorite() {
  if (!selectedCard || !tg?.initDataUnsafe?.user) return toast("Ouvre via Telegram.");
  const uid = tg.initDataUnsafe.user.id;

  const res = await fetch("/api/favorite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: uid, card_id: selectedCard.id }),
  });

  const json = await res.json();

  if (json.favorited) favorites.add(String(selectedCard.id));
  else favorites.delete(String(selectedCard.id));

  btnFav.textContent = json.favorited ? "💔 Retirer" : "❤️ Favori";
  render();
}

function shareCard() {
  if (!selectedCard) return;
  tg?.sendData?.(JSON.stringify({ type: "share_card", card_id: selectedCard.id }));
  toast("Envoyé au bot ✅");
}

let toastTimer = null;
function toast(msg) {
  if (!msg) {
    toastEl.classList.add("hidden");
    toastEl.textContent = "";
    return;
  }
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.add("hidden");
  }, 2400);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(str) {
  return escapeHtml(str).replaceAll("`", "");
}
