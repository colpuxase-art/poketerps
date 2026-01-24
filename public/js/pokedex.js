/* =========================================================
   HARVESTDEX — FRONT LOGIC (FINAL)
   ========================================================= */

const tg = window.Telegram?.WebApp;
tg?.ready?.();
tg?.expand?.();

let cards = [];
let seasons = [];
let favorites = new Set();
let showMyDex = false;
let selectedCard = null;

const listEl = document.getElementById("list");
const detailEl = document.getElementById("detail");

const tabDex = document.getElementById("tab-dex");
const tabMyDex = document.getElementById("tab-mydex");

const filterType = document.getElementById("filter-type");
const filterSeason = document.getElementById("filter-season");
const filterRarity = document.getElementById("filter-rarity");

// detail
const dImg = document.getElementById("detail-img");
const dName = document.getElementById("detail-name");
const dDesc = document.getElementById("detail-desc");
const dThc = document.getElementById("detail-thc");
const dTerp = document.getElementById("detail-terp");
const dAroma = document.getElementById("detail-aroma");
const dEffects = document.getElementById("detail-effects");
const bType = document.getElementById("badge-type");
const bSeason = document.getElementById("badge-season");
const bRarity = document.getElementById("badge-rarity");

const btnFav = document.getElementById("btn-fav");
const btnShare = document.getElementById("btn-share");
const btnClose = document.getElementById("close-detail");

init();

async function init() {
  await Promise.all([loadCards(), loadSeasons()]);
  await loadFavorites();
  renderList();
  bindEvents();
}

async function loadCards() {
  const res = await fetch("/api/cards", { cache: "no-store" });
  const data = await res.json();
  cards = Array.isArray(data) ? data : [];
}

async function loadSeasons() {
  const res = await fetch("/api/seasons", { cache: "no-store" });
  const data = await res.json();
  seasons = Array.isArray(data) ? data : [];

  seasons.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.label;
    filterSeason.appendChild(opt);
  });
}

async function loadFavorites() {
  if (!tg?.initDataUnsafe?.user) return;
  const uid = tg.initDataUnsafe.user.id;

  const res = await fetch(`/api/mydex/${uid}`, { cache: "no-store" });
  const favCards = await res.json();
  favorites = new Set((Array.isArray(favCards) ? favCards : []).map((c) => String(c.id)));
}

function bindEvents() {
  tabDex.onclick = () => {
    showMyDex = false;
    tabDex.classList.add("active");
    tabMyDex.classList.remove("active");
    renderList();
  };

  tabMyDex.onclick = () => {
    showMyDex = true;
    tabMyDex.classList.add("active");
    tabDex.classList.remove("active");
    renderList();
  };

  filterType.onchange = filterSeason.onchange = filterRarity.onchange = renderList;
  btnClose.onclick = closeDetail;
  btnFav.onclick = toggleFavorite;
  btnShare.onclick = shareCard;
}

function renderList() {
  listEl.innerHTML = "";

  let filtered = cards.filter((c) => {
    if (showMyDex && !favorites.has(String(c.id))) return false;
    if (filterType.value && c.type !== filterType.value) return false;
    if (filterSeason.value && c.season !== filterSeason.value) return false;
    if (filterRarity.value && c.rarity !== filterRarity.value) return false;
    return true;
  });

  if (!filtered.length) {
    listEl.innerHTML = "<p style='opacity:.6;padding:20px'>Aucune fiche</p>";
    return;
  }

  filtered.forEach((c) => {
    const card = document.createElement("div");
    card.className = "card";
    card.onclick = () => openDetail(c);

    card.innerHTML = `
      <img src="${c.img || ""}" />
      <div class="card-body">
        <div class="card-title">${escapeHtml(c.name || "")}</div>
        <div class="card-badges">
          <span class="badge">${escapeHtml(String(c.type || "").toUpperCase())}</span>
          ${c.season ? `<span class="badge badge-season">${escapeHtml(c.season)}</span>` : ""}
          <span class="badge badge-rarity ${escapeHtml(c.rarity || "COMMON")}">${escapeHtml(c.rarity || "COMMON")}</span>
          ${favorites.has(String(c.id)) ? `<span class="badge" style="border-color:#ef4444;color:#ef4444">❤</span>` : ""}
        </div>
      </div>
    `;
    listEl.appendChild(card);
  });
}

function openDetail(c) {
  selectedCard = c;
  detailEl.classList.remove("hidden");

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
  detailEl.classList.add("hidden");
  selectedCard = null;
}

async function toggleFavorite() {
  if (!selectedCard || !tg?.initDataUnsafe?.user) return;
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
  renderList();
}

function shareCard() {
  if (!selectedCard) return;

  // Telegram WebApp sendData -> bot receives msg.web_app_data
  tg?.sendData?.(
    JSON.stringify({
      type: "share_card",
      card_id: selectedCard.id,
    })
  );
}

// basic escape for innerHTML usage
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
