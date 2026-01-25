const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

/* =========================
   PROTECTION BOT (Render)
   ========================= */
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

/* =========================
   Static files
   ========================= */
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const PORT = process.env.PORT || 3000;

/* ================== ENV ================== */
const TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const WEBAPP_URL = process.env.WEBAPP_URL;

// Images (URL)
const START_IMAGE_URL =
  process.env.START_IMAGE_URL || "https://i.postimg.cc/9Qp0JmJY/harvestdex-start.jpg";
const INFO_IMAGE_URL =
  process.env.INFO_IMAGE_URL || "https://i.postimg.cc/3w3qj7tK/harvestdex-info.jpg";
const SUPPORT_IMAGE_URL =
  process.env.SUPPORT_IMAGE_URL || "https://i.postimg.cc/Zq7X6v8S/harvestdex-support.jpg";
const ADMIN_IMAGE_URL =
  process.env.ADMIN_IMAGE_URL || "https://i.postimg.cc/T3w2VY8Q/harvestdex-admin.jpg";

if (!TOKEN) {
  console.error("❌ BOT_TOKEN manquant (Render -> Environment).");
  process.exit(1);
}
if (!WEBAPP_URL) {
  console.error("❌ WEBAPP_URL manquant (Render -> Environment).");
  process.exit(1);
}

const supabaseReady = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE);
if (!supabaseReady) {
  console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE manquant (Render -> Environment).");
}

const sb = supabaseReady
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } })
  : null;

function assertSupabase() {
  if (!sb) throw new Error("Supabase non configuré (variables Render manquantes).");
}

/* =========================
   Subcategories (app + bot)
   ========================= */
const SUBCATEGORIES = [
  { id: "dry_sift", type: "hash", label: "Dry Sift", sort: 10 },
  { id: "static_sift", type: "hash", label: "Static Sift", sort: 15 },
  { id: "kief_pollen", type: "hash", label: "Kief / Pollen", sort: 18 },
  { id: "ice_o_lator", type: "hash", label: "Ice-O-Lator / Bubble", sort: 20 },
  { id: "full_melt", type: "hash", label: "Full Melt", sort: 25 },
  { id: "temple_ball", type: "hash", label: "Temple Ball", sort: 30 },
  { id: "piatella", type: "hash", label: "Piatella", sort: 35 },
  { id: "charas", type: "hash", label: "Charas / Hand Rubbed", sort: 40 },
  { id: "pressed_hash", type: "hash", label: "Pressed Hash", sort: 45 },

  { id: "flower", type: "weed", label: "Flower", sort: 10 },
  { id: "small_buds", type: "weed", label: "Small Buds", sort: 20 },
  { id: "trim", type: "weed", label: "Trim", sort: 30 },

  { id: "rosin", type: "extraction", label: "Rosin", sort: 10 },
  { id: "live_rosin", type: "extraction", label: "Live Rosin", sort: 12 },
  { id: "resin", type: "extraction", label: "Resin", sort: 18 },
  { id: "live_resin", type: "extraction", label: "Live Resin", sort: 20 },
  { id: "shatter", type: "extraction", label: "Shatter", sort: 30 },
  { id: "wax", type: "extraction", label: "Wax", sort: 32 },
  { id: "budder_badder", type: "extraction", label: "Budder / Badder", sort: 34 },
  { id: "crumble", type: "extraction", label: "Crumble", sort: 36 },
  { id: "diamonds", type: "extraction", label: "Diamonds", sort: 38 },
  { id: "sauce", type: "extraction", label: "Sauce", sort: 40 },
  { id: "distillate", type: "extraction", label: "Distillate", sort: 50 },
  { id: "co2_oil", type: "extraction", label: "CO₂ Oil", sort: 55 },
  { id: "rso", type: "extraction", label: "RSO", sort: 60 },

  { id: "wpff_fresh_frozen", type: "wpff", label: "Fresh Frozen", sort: 10 },
  { id: "wpff_whole_plant", type: "wpff", label: "Whole Plant", sort: 12 },
  { id: "wpff_first_pull", type: "wpff", label: "First Pull", sort: 20 },
  { id: "wpff_full_spectrum", type: "wpff", label: "Full Spectrum", sort: 30 },
];

app.get("/api/subcategories", (req, res) => res.json(SUBCATEGORIES));

/* ================== BOT ================== */
const bot = new TelegramBot(TOKEN, { polling: true });

// Force mode polling clean: supprime webhook (sinon Telegram peut foutre le bazar)
bot.deleteWebHook().catch(() => {});

// Retry soft si Telegram renvoie 409 ou autre polling_error
bot.on("polling_error", async (err) => {
  console.error("❌ polling_error:", err?.response?.body || err);
  const code = err?.response?.body?.error_code || err?.code;
  // 409 = un autre getUpdates en cours (autre instance)
  // On tente un stop/start pour récupérer si c'était un conflit transitoire
  try {
    await bot.stopPolling();
  } catch {}
  setTimeout(() => {
    bot.startPolling().catch(() => {});
  }, code === 409 ? 3500 : 1500);
});

/* ================== ADMIN CONFIG ================== */
const ADMIN_IDS = new Set([6675436692]); // ✅ TON TELEGRAM USER ID
const isAdmin = (userId) => ADMIN_IDS.has(Number(userId));

const allowedTypes = new Set(["hash", "weed", "extraction", "wpff"]);
const micronValues = ["120u", "90u", "73u", "45u"];
const weedKindValues = ["indica", "sativa", "hybrid"];

const isMicron = (v) => micronValues.includes(String(v || "").toLowerCase());
const isWeedKind = (v) => weedKindValues.includes(String(v || "").toLowerCase());

const csvToArr = (str) =>
  (str || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const typeLabel = (t) => ({ hash: "Hash", weed: "Weed", extraction: "Extraction", wpff: "WPFF" }[t] || t);
const weedKindLabel = (k) => ({ indica: "Indica", sativa: "Sativa", hybrid: "Hybrid" }[k] || k);

/* ================== DB HELPERS (Supabase) ================== */
async function dbListCards() {
  assertSupabase();
  const { data, error } = await sb.from("cards").select("*").order("id", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function dbGetCard(id) {
  assertSupabase();
  const { data, error } = await sb.from("cards").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function dbInsertCard(payload) {
  assertSupabase();
  const { data, error } = await sb.from("cards").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

async function dbUpdateCard(id, patch) {
  assertSupabase();
  const { data, error } = await sb.from("cards").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

async function dbDeleteCard(id) {
  assertSupabase();
  const { error } = await sb.from("cards").delete().eq("id", id);
  if (error) throw error;
}

/* ================== FEATURED (Rare/Shiny du moment) ================== */
async function dbGetFeatured() {
  assertSupabase();
  const { data, error } = await sb
    .from("cards")
    .select("*")
    .eq("is_featured", true)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function dbSetFeatured(id, title) {
  assertSupabase();

  const { error: e1 } = await sb
    .from("cards")
    .update({ is_featured: false, featured_title: null })
    .eq("is_featured", true);
  if (e1) throw e1;

  const patch = { is_featured: true, featured_title: title || "✨ Shiny du moment" };
  const { data, error: e2 } = await sb.from("cards").update(patch).eq("id", id).select("*").single();
  if (e2) throw e2;

  return data;
}

async function dbUnsetFeatured() {
  assertSupabase();
  const { error } = await sb
    .from("cards")
    .update({ is_featured: false, featured_title: null })
    .eq("is_featured", true);
  if (error) throw error;
}

/* ================== API POUR LA MINI-APP ================== */
app.get("/api/cards", async (req, res) => {
  try {
    const cards = await dbListCards();
    const mapped = cards.map((c) => ({ ...c, desc: c.description ?? "—" }));
    res.json(mapped);
  } catch (e) {
    console.error("❌ /api/cards:", e.message);
    res.status(500).json({ error: "db_error", message: e.message });
  }
});

app.get("/api/featured", async (req, res) => {
  try {
    const c = await dbGetFeatured();
    if (!c) return res.json(null);
    res.json({ ...c, desc: c.description ?? "—" });
  } catch (e) {
    console.error("❌ /api/featured:", e.message);
    res.status(500).json({ error: "db_error", message: e.message });
  }
});

/* =========================
   Favorites (Mon Dex)
   ========================= */
app.post("/api/favorite", async (req, res) => {
  try {
    assertSupabase();
    const { user_id, card_id } = req.body || {};
    if (!user_id || !card_id) return res.status(400).json({ error: "missing user_id/card_id" });

    const { data: existing, error: e1 } = await sb
      .from("favorites")
      .select("id")
      .eq("user_id", user_id)
      .eq("card_id", card_id)
      .maybeSingle();

    if (e1 && e1.code !== "PGRST116") throw e1;

    if (existing?.id) {
      const { error: e2 } = await sb.from("favorites").delete().eq("id", existing.id);
      if (e2) throw e2;
      return res.json({ favorited: false });
    } else {
      const { error: e3 } = await sb.from("favorites").insert({ user_id, card_id });
      if (e3) throw e3;
      return res.json({ favorited: true });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get("/api/mydex/:user_id", async (req, res) => {
  try {
    assertSupabase();
    const user_id = req.params.user_id;

    const { data: favs, error: e1 } = await sb.from("favorites").select("card_id").eq("user_id", user_id);
    if (e1) throw e1;

    const ids = (favs || []).map((f) => f.card_id);
    if (!ids.length) return res.json([]);

    const { data: cards, error: e2 } = await sb.from("cards").select("*").in("id", ids).order("created_at", { ascending: false });
    if (e2) throw e2;

    res.json(cards || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ================== MENUS BOT ================== */
function startKeyboard(userId) {
  const admin = isAdmin(userId);

  const keyboard = [
    [{ text: "📘 Ouvrir le Dex", web_app: { url: WEBAPP_URL } }],
    [
      { text: "⭐ Mon Dex", web_app: { url: WEBAPP_URL + "#mydex" } },
      { text: "👤 Mon Profil", web_app: { url: WEBAPP_URL + "#profile" } },
    ],
    [{ text: "ℹ️ Informations", callback_data: "menu_info" }],
    [{ text: "🤝 Nous soutenir", callback_data: "menu_support" }],
  ];

  if (admin) keyboard.push([{ text: "🧰 Admin", callback_data: "menu_admin" }]);
  return keyboard;
}

function sendStartMenu(chatId, userId) {
  const keyboard = startKeyboard(userId);

  bot
    .sendPhoto(chatId, START_IMAGE_URL, {
      caption:
        "🧬 *HarvestDex / PokéTerps*\n\n" +
        "Collectionne les fiches, ajoute-les à *Mon Dex* et explore les catégories 🔥\n\n" +
        "_Info éducative uniquement (aucune vente)._",
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    })
    .catch(() => {
      bot.sendMessage(chatId, "🧬 HarvestDex / PokéTerps\n\nChoisis une section 👇", {
        reply_markup: { inline_keyboard: keyboard },
      });
    });
}

function sendInfoMenu(chatId) {
  const kb = [[{ text: "⬅️ Retour", callback_data: "menu_start" }]];

  bot
    .sendPhoto(chatId, INFO_IMAGE_URL, {
      caption:
        "ℹ️ *Informations — HarvestDex*\n\n" +
        "📌 *But :* fiches éducatives sur THC / terpènes / arômes / effets (ressentis).\n\n" +
        "🗂️ *Catégories :*\n" +
        "• *Hash* (types de hash)\n" +
        "• *Weed* (indica/sativa/hybrid)\n" +
        "• *Extraction* (rosin, resin, etc.)\n" +
        "• *WPFF* (fresh frozen / whole plant...)\n\n" +
        "⚠️ *Disclaimer :* Les effets varient selon la personne. Respecte la loi.\n",
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: kb },
    })
    .catch(() => {
      bot.sendMessage(
        chatId,
        "ℹ️ *Informations — HarvestDex*\n\n" +
          "📌 But : fiches éducatives sur THC / terpènes / arômes / effets.\n\n" +
          "⚠️ Disclaimer : Les effets varient selon la personne. Respecte la loi.",
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: kb } }
      );
    });
}

function sendSupportMenu(chatId) {
  const kb = [
    [{ text: "📣 Nous suivre", callback_data: "support_follow" }],
    [{ text: "🕹️ Jouer", callback_data: "support_play" }],
    [{ text: "💝 Don", callback_data: "support_donate" }],
    [{ text: "🤝 Nos partenaires", callback_data: "support_partners" }],
    [{ text: "⬅️ Retour", callback_data: "menu_start" }],
  ];

  bot
    .sendPhoto(chatId, SUPPORT_IMAGE_URL, {
      caption: "🤝 *Nous soutenir*\n\nChoisis une option :",
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: kb },
    })
    .catch(() => {
      bot.sendMessage(chatId, "🤝 *Nous soutenir*\n\nChoisis une option :", {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: kb },
      });
    });
}

function sendPartnersMenu(chatId) {
  const kb = [[{ text: "⬅️ Retour", callback_data: "menu_support" }]];
  bot.sendMessage(
    chatId,
    "🤝 *Nos partenaires*\n\n" + "Pour l’instant, *aucun partenaire*.\n" + "Veuillez nous contacter si vous voulez apparaître ici.",
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: kb } }
  );
}

function sendAdminMenu(chatId, userId) {
  if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  const kb = [
    [{ text: "📜 Voir commandes Admin", callback_data: "admin_help" }],
    [{ text: "📊 Statistiques (/stat)", callback_data: "admin_stat" }],
    [{ text: "⬅️ Retour", callback_data: "menu_start" }],
  ];

  bot
    .sendPhoto(chatId, ADMIN_IMAGE_URL, {
      caption: "🧰 *Admin — HarvestDex*\n\nGestion des fiches + stats.",
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: kb },
    })
    .catch(() => {
      bot.sendMessage(chatId, "🧰 *Admin — HarvestDex*\n\nGestion des fiches + stats.", {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: kb },
      });
    });
}

/* ================== /start ================= */
bot.onText(/^\/start(?:\s|$)/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  sendStartMenu(chatId, userId);
});

/* ================== FORMULAIRES (ADD / EDIT / DEL) ================== */
const addWizard = new Map();
const editWizard = new Map();
const delWizard = new Map();

function addCancel(chatId) {
  addWizard.delete(chatId);
  bot.sendMessage(chatId, "❌ Ajout annulé.");
}
function editCancel(chatId) {
  editWizard.delete(chatId);
  bot.sendMessage(chatId, "❌ Modification annulée.");
}
function delCancel(chatId) {
  delWizard.delete(chatId);
  bot.sendMessage(chatId, "❌ Suppression annulée.");
}

function askType(chatId) {
  bot.sendMessage(chatId, "2/10 — Choisis la *catégorie* :", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "Hash", callback_data: "add_type_hash" }, { text: "Weed", callback_data: "add_type_weed" }],
        [{ text: "Extraction", callback_data: "add_type_extraction" }, { text: "WPFF", callback_data: "add_type_wpff" }],
        [{ text: "❌ Annuler", callback_data: "add_cancel" }],
      ],
    },
  });
}

function askMicron(chatId) {
  bot.sendMessage(chatId, "3/10 — Choisis le *micron* :", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "120u", callback_data: "add_micron_120u" }, { text: "90u", callback_data: "add_micron_90u" }],
        [{ text: "73u", callback_data: "add_micron_73u" }, { text: "45u", callback_data: "add_micron_45u" }],
        [{ text: "Aucun", callback_data: "add_micron_none" }],
        [{ text: "❌ Annuler", callback_data: "add_cancel" }],
      ],
    },
  });
}

function askWeedKind(chatId) {
  bot.sendMessage(chatId, "3/10 — Choisis *indica / sativa / hybrid* :", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "Indica", callback_data: "add_weedkind_indica" }, { text: "Sativa", callback_data: "add_weedkind_sativa" }],
        [{ text: "Hybrid", callback_data: "add_weedkind_hybrid" }],
        [{ text: "❌ Annuler", callback_data: "add_cancel" }],
      ],
    },
  });
}

async function addFinish(chatId) {
  const state = addWizard.get(chatId);
  if (!state) return;
  const d = state.data;

  const t = String(d.type || "").toLowerCase();

  const payload = {
    name: d.name,
    type: t,
    thc: d.thc || "—",
    description: d.description || "—",
    img: d.img || "",
    terpenes: csvToArr(d.terpenes || ""),
    aroma: csvToArr(d.aroma || ""),
    effects: csvToArr(d.effects || ""),
    advice: d.advice || "Info éducative. Les effets varient selon la personne. Respecte la loi.",
    micron: null,
    weed_kind: null,
  };

  if (t === "weed") {
    payload.weed_kind = d.weed_kind || "hybrid";
    payload.micron = null;
  } else {
    payload.micron = d.micron || null;
    payload.weed_kind = null;
  }

  const card = await dbInsertCard(payload);
  addWizard.delete(chatId);

  const extra =
    card.type === "weed"
      ? card.weed_kind
        ? ` • ${weedKindLabel(card.weed_kind)}`
        : ""
      : card.micron
        ? ` • ${card.micron}`
        : "";

  bot.sendMessage(
    chatId,
    "✅ *Fiche ajoutée !*\n\n" +
      `#${card.id} — *${card.name}*\n` +
      `Catégorie: *${typeLabel(card.type)}${extra}*\n` +
      `${card.thc}\n\n` +
      `🧬 ${card.description}\n` +
      `🌿 Terpènes: ${card.terpenes?.length ? card.terpenes.join(", ") : "—"}\n` +
      `👃 Arômes: ${card.aroma?.length ? card.aroma.join(", ") : "—"}\n` +
      `🧠 Effets: ${card.effects?.length ? card.effects.join(", ") : "—"}\n` +
      `⚠️ ${card.advice}`,
    { parse_mode: "Markdown" }
  );
}

/* ================== COMMANDES ADMIN (base) ================== */
bot.onText(/^\/myid$/, (msg) =>
  bot.sendMessage(msg.chat.id, `Ton Telegram ID = ${msg.from?.id}\nChat ID = ${msg.chat.id}`)
);

bot.onText(/^\/adminhelp$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  return bot.sendMessage(
    chatId,
    "👑 *Commandes Admin HarvestDex*\n\n" +
      "✅ /dbtest *(test Supabase)*\n" +
      "✅ /list [hash|weed|extraction|wpff|120u|90u|73u|45u|indica|sativa|hybrid]\n" +
      "✅ /addform *(ajout guidé)*\n" +
      "✅ /editform *(modification guidée)*\n" +
      "✅ /delform *(suppression guidée)*\n" +
      "✅ /edit id field value\n" +
      "✅ /del id\n\n" +
      "✨ *Rare du moment*\n" +
      "✅ /rare id (titre optionnel)\n" +
      "✅ /unrare\n" +
      "✅ /rareinfo\n\n" +
      "📊 *Stats*\n" +
      "✅ /stat\n",
    { parse_mode: "Markdown" }
  );
});

bot.onText(/^\/dbtest$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    assertSupabase();
    const { error } = await sb.from("cards").select("id").limit(1);
    if (error) throw error;
    bot.sendMessage(chatId, "✅ Supabase OK (table cards accessible)");
  } catch (e) {
    bot.sendMessage(chatId, `❌ Supabase KO: ${e.message}`);
  }
});

/* ================== /stat (admin only) ================== */
bot.onText(/^\/stat$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    assertSupabase();

    const { count: cardsCount, error: e1 } = await sb.from("cards").select("*", { count: "exact", head: true });
    if (e1) throw e1;

    const { count: favCount, error: e2 } = await sb.from("favorites").select("*", { count: "exact", head: true });
    if (e2) throw e2;

    const featured = await dbGetFeatured();

    bot.sendMessage(
      chatId,
      "📊 *Stats — HarvestDex*\n\n" +
        `• Fiches: *${cardsCount ?? 0}*\n` +
        `• Favoris: *${favCount ?? 0}*\n` +
        `• Rare du moment: *${featured ? "#" + featured.id + " " + featured.name : "Aucune"}*\n`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    bot.sendMessage(chatId, `❌ /stat: ${e.message}`);
  }
});

/* ================== Rare du moment ================== */
bot.onText(/^\/rare\s+(\d+)(?:\s+([\s\S]+))?$/m, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const id = Number(match[1]);
    const title = (match[2] || "").trim();

    const card = await dbGetCard(id);
    if (!card) return bot.sendMessage(chatId, "❌ ID introuvable.");

    const updated = await dbSetFeatured(id, title || "✨ Shiny du moment");

    const extra =
      updated.type === "weed"
        ? updated.weed_kind ? ` • ${updated.weed_kind}` : ""
        : updated.micron ? ` • ${updated.micron}` : "";

    bot.sendMessage(
      chatId,
      `✨ *Rare du moment activée !*\n\n#${updated.id} — *${updated.name}*\n${typeLabel(updated.type)}${extra}\nTitre: *${updated.featured_title || "✨ Shiny du moment"}*`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    bot.sendMessage(chatId, `❌ /rare: ${e.message}`);
  }
});

bot.onText(/^\/unrare$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    await dbUnsetFeatured();
    bot.sendMessage(chatId, "✅ Rare du moment désactivée.");
  } catch (e) {
    bot.sendMessage(chatId, `❌ /unrare: ${e.message}`);
  }
});

bot.onText(/^\/rareinfo$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const c = await dbGetFeatured();
    if (!c) return bot.sendMessage(chatId, "Aucune Rare du moment actuellement.");

    const extra =
      c.type === "weed"
        ? c.weed_kind ? ` • ${c.weed_kind}` : ""
        : c.micron ? ` • ${c.micron}` : "";

    bot.sendMessage(
      chatId,
      `✨ Rare actuelle:\n#${c.id} — ${c.name}\n${typeLabel(c.type)}${extra}\nTitre: ${c.featured_title || "✨ Shiny du moment"}`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    bot.sendMessage(chatId, `❌ /rareinfo: ${e.message}`);
  }
});

/* ------------------ LIST ------------------ */
bot.onText(/^\/list(?:\s+(\w+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const filter = (match[1] || "").toLowerCase();
    let cards = await dbListCards();

    if (filter) {
      if (allowedTypes.has(filter)) {
        cards = cards.filter((c) => String(c.type || "").toLowerCase() === filter);
      } else if (isMicron(filter)) {
        cards = cards.filter((c) => String(c.micron || "").toLowerCase() === filter);
      } else if (isWeedKind(filter)) {
        cards = cards.filter((c) => String(c.weed_kind || "").toLowerCase() === filter);
      } else {
        return bot.sendMessage(chatId, "❌ Filtre inconnu. Exemple: /list weed, /list 90u, /list indica");
      }
    }

    if (!cards.length) return bot.sendMessage(chatId, "Aucune fiche.");

    const lines = cards
      .slice(0, 80)
      .map((c) => {
        const t = String(c.type || "");
        const extra =
          t === "weed"
            ? c.weed_kind ? ` • ${c.weed_kind}` : ""
            : c.micron ? ` • ${c.micron}` : "";
        return `#${c.id} • ${t}${extra} • ${c.name}`;
      })
      .join("\n");

    bot.sendMessage(chatId, `📚 Fiches (${cards.length})\n\n${lines}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /list: ${e.message}`);
  }
});

/* ------------------ DEL ------------------ */
bot.onText(/^\/del\s+(\d+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const id = Number(match[1]);
    const card = await dbGetCard(id);
    if (!card) return bot.sendMessage(chatId, "❌ ID introuvable.");

    await dbDeleteCard(id);
    bot.sendMessage(chatId, `🗑️ Supprimé: #${id}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /del: ${e.message}`);
  }
});

/* ------------------ EDIT (simple) ------------------ */
bot.onText(/^\/edit\s+(\d+)\s+(\w+)\s+([\s\S]+)$/m, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const id = Number(match[1]);
    const field = match[2].toLowerCase();
    const value = (match[3] || "").trim();

    const allowedFields = new Set([
      "name", "type", "micron", "weed_kind", "thc", "description", "img", "advice", "terpenes", "aroma", "effects",
    ]);
    if (!allowedFields.has(field)) return bot.sendMessage(chatId, "❌ Champ invalide.");

    const card = await dbGetCard(id);
    if (!card) return bot.sendMessage(chatId, "❌ ID introuvable.");

    const patch = {};

    if (field === "type") {
      const newType = value.toLowerCase();
      if (!allowedTypes.has(newType)) return bot.sendMessage(chatId, "❌ type invalide: hash|weed|extraction|wpff");
      patch.type = newType;

      if (newType === "weed") {
        patch.micron = null;
        patch.weed_kind = card.weed_kind || "hybrid";
      } else {
        patch.weed_kind = null;
      }
    } else if (field === "micron") {
      const v = value === "-" ? null : value.toLowerCase();
      if (v && !isMicron(v)) return bot.sendMessage(chatId, "❌ micron invalide: 120u|90u|73u|45u (ou `-`)");
      if (String(card.type).toLowerCase() === "weed") return bot.sendMessage(chatId, "❌ Weed n'a pas de micron. Modifie weed_kind.");
      patch.micron = v;
    } else if (field === "weed_kind") {
      const v = value === "-" ? null : value.toLowerCase();
      if (v && !isWeedKind(v)) return bot.sendMessage(chatId, "❌ weed_kind invalide: indica|sativa|hybrid (ou `-`)");
      if (String(card.type).toLowerCase() !== "weed") return bot.sendMessage(chatId, "❌ weed_kind existe seulement pour le type weed.");
      patch.weed_kind = v || "hybrid";
      patch.micron = null;
    } else if (["terpenes", "aroma", "effects"].includes(field)) {
      patch[field] = csvToArr(value);
    } else {
      patch[field] = value === "-" ? "" : value;
    }

    await dbUpdateCard(id, patch);
    bot.sendMessage(chatId, `✅ Modifié #${id} → ${field} mis à jour.`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /edit: ${e.message}`);
  }
});

/* ================== FORMS (ADD / EDIT / DEL) ================== */
bot.onText(/^\/addform$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  addWizard.set(chatId, { step: "name", data: {} });
  bot.sendMessage(
    chatId,
    "📝 *Ajout d’une fiche* (formulaire)\n\n" +
      "1/10 — Envoie le *nom*.\nEx: `Static Hash Premium`",
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "add_cancel" }]] } }
  );
});

bot.onText(/^\/editform$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const cards = await dbListCards();
    if (!cards.length) return bot.sendMessage(chatId, "Aucune fiche à modifier.");

    const buttons = cards.slice(0, 30).map((c) => [{ text: `#${c.id} ${c.name}`, callback_data: `edit_pick_${c.id}` }]);
    buttons.push([{ text: "❌ Annuler", callback_data: "edit_cancel" }]);

    bot.sendMessage(chatId, "🛠️ Choisis la fiche à modifier :", { reply_markup: { inline_keyboard: buttons } });
  } catch (e) {
    bot.sendMessage(chatId, `❌ /editform: ${e.message}`);
  }
});

bot.onText(/^\/delform$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const cards = await dbListCards();
    if (!cards.length) return bot.sendMessage(chatId, "Aucune fiche à supprimer.");

    const buttons = cards.slice(0, 30).map((c) => [{ text: `🗑️ #${c.id} ${c.name}`, callback_data: `del_pick_${c.id}` }]);
    buttons.push([{ text: "❌ Annuler", callback_data: "del_cancel" }]);

    bot.sendMessage(chatId, "🗑️ Choisis la fiche à supprimer :", { reply_markup: { inline_keyboard: buttons } });
  } catch (e) {
    bot.sendMessage(chatId, `❌ /delform: ${e.message}`);
  }
});

/* ================== CALLBACKS (UN SEUL HANDLER) ================= */
bot.on("callback_query", async (query) => {
  const chatId = query?.message?.chat?.id;
  const userId = query?.from?.id;
  const data = query?.data || "";
  if (!chatId) return;

  try { await bot.answerCallbackQuery(query.id); } catch {}

  /* ===== MENUS PRINCIPAUX ===== */
  if (data === "menu_start") return sendStartMenu(chatId, userId);
  if (data === "menu_info") return sendInfoMenu(chatId);
  if (data === "menu_support") return sendSupportMenu(chatId);
  if (data === "menu_admin") return sendAdminMenu(chatId, userId);

  /* ===== SUPPORT ===== */
  if (data === "support_follow") {
    return bot.sendMessage(
      chatId,
      "📣 *Nous suivre*\n\n" +
        "• Instagram : (mets ton lien)\n" +
        "• TikTok : (mets ton lien)\n" +
        "• Telegram : (mets ton lien)\n\n" +
        "Envoie-moi tes liens et je te les mets proprement.",
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] } }
    );
  }
  if (data === "support_play") {
    return bot.sendMessage(
      chatId,
      "🕹️ *Jouer*\n\nIci on mettra les jeux pour gagner des récompenses.\n_Bientôt disponible._",
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] } }
    );
  }
  if (data === "support_donate") {
    return bot.sendMessage(
      chatId,
      "💝 *Don*\n\nBientôt : lien de don / crypto / TWINT.\nEnvoie-moi ton lien et je le mets.",
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] } }
    );
  }
  if (data === "support_partners") return sendPartnersMenu(chatId);

  /* ===== ADMIN MENU ===== */
  if (data === "admin_stat") {
    if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");
    return bot.sendMessage(chatId, "📊 Utilise la commande : /stat");
  }

  if (data === "admin_help") {
    if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

    const text =
      "👑 <b>Commandes Admin HarvestDex</b>\n\n" +
      "✅ /dbtest <i>(test Supabase)</i>\n" +
      "✅ /list [hash|weed|extraction|wpff|120u|90u|73u|45u|indica|sativa|hybrid]\n" +
      "✅ /addform <i>(ajout guidé)</i>\n" +
      "✅ /editform <i>(modification guidée)</i>\n" +
      "✅ /delform <i>(suppression guidée)</i>\n" +
      "✅ /edit id field value\n" +
      "✅ /del id\n\n" +
      "✨ <b>Rare du moment</b>\n" +
      "✅ /rare id (titre optionnel)\n" +
      "✅ /unrare\n" +
      "✅ /rareinfo\n\n" +
      "📊 <b>Stats</b>\n" +
      "✅ /stat\n\n" +
      "<b>Fields /edit :</b>\n" +
      "name, type, micron, weed_kind, thc, description, img, advice, terpenes, aroma, effects";

    return bot.sendMessage(chatId, text, { parse_mode: "HTML" });
  }

  /* ===== FORMS: CANCEL ===== */
  if (isAdmin(userId) && data === "add_cancel") return addCancel(chatId);
  if (isAdmin(userId) && data === "edit_cancel") return editCancel(chatId);
  if (isAdmin(userId) && data === "del_cancel") return delCancel(chatId);

  /* ===== ADD: type ===== */
  if (isAdmin(userId) && data.startsWith("add_type_")) {
    const state = addWizard.get(chatId);
    if (!state) return;
    const t = data.replace("add_type_", "");
    if (!allowedTypes.has(t)) return;

    state.data.type = t;
    if (t === "weed") {
      state.step = "weed_kind";
      addWizard.set(chatId, state);
      return askWeedKind(chatId);
    } else {
      state.step = "micron";
      addWizard.set(chatId, state);
      return askMicron(chatId);
    }
  }

  /* ===== ADD: weed_kind ===== */
  if (isAdmin(userId) && data.startsWith("add_weedkind_")) {
    const state = addWizard.get(chatId);
    if (!state) return;

    const k = data.replace("add_weedkind_", "");
    if (!isWeedKind(k)) return;

    state.data.weed_kind = k;
    state.data.micron = "";
    state.step = "thc";
    addWizard.set(chatId, state);

    return bot.sendMessage(chatId, "4/10 — Envoie le *THC* (ex: `THC: 20–26%`).", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "add_cancel" }]] },
    });
  }

  /* ===== ADD: micron ===== */
  if (isAdmin(userId) && data.startsWith("add_micron_")) {
    const state = addWizard.get(chatId);
    if (!state) return;

    const m = data.replace("add_micron_", "");
    state.data.micron = m === "none" ? "" : m;
    state.data.weed_kind = null;
    state.step = "thc";
    addWizard.set(chatId, state);

    return bot.sendMessage(chatId, "4/10 — Envoie le *THC* (ex: `THC: 35–55%`).", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "add_cancel" }]] },
    });
  }

  /* ===== DEL: pick ===== */
  if (isAdmin(userId) && data.startsWith("del_pick_")) {
    try {
      const id = Number(data.replace("del_pick_", ""));
      const card = await dbGetCard(id);
      if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");

      delWizard.set(chatId, { id });

      const extra =
        card.type === "weed"
          ? card.weed_kind ? ` • ${card.weed_kind}` : ""
          : card.micron ? ` • ${card.micron}` : "";

      return bot.sendMessage(
        chatId,
        `⚠️ Confirme la suppression :\n\n#${card.id} — ${card.name}\n(${card.type}${extra})`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ CONFIRMER", callback_data: `del_confirm_${id}` }],
              [{ text: "❌ Annuler", callback_data: "del_cancel" }],
            ],
          },
        }
      );
    } catch (e) {
      return bot.sendMessage(chatId, `❌ del_pick: ${e.message}`);
    }
  }

  /* ===== DEL: confirm ===== */
  if (isAdmin(userId) && data.startsWith("del_confirm_")) {
    try {
      const id = Number(data.replace("del_confirm_", ""));
      const st = delWizard.get(chatId);
      if (!st || st.id !== id) return bot.sendMessage(chatId, "❌ Relance /delform.");

      await dbDeleteCard(id);
      delWizard.delete(chatId);
      return bot.sendMessage(chatId, `🗑️ Supprimé: #${id}`);
    } catch (e) {
      return bot.sendMessage(chatId, `❌ del_confirm: ${e.message}`);
    }
  }

  /* ===== EDIT: pick -> choisir champ ===== */
  if (isAdmin(userId) && data.startsWith("edit_pick_")) {
    try {
      const id = Number(data.replace("edit_pick_", ""));
      const card = await dbGetCard(id);
      if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");

      const isWeed = String(card.type).toLowerCase() === "weed";
      const line2 = isWeed
        ? [{ text: "Weed Kind", callback_data: `edit_field_${id}_weed_kind` }, { text: "THC", callback_data: `edit_field_${id}_thc` }]
        : [{ text: "Micron", callback_data: `edit_field_${id}_micron` }, { text: "THC", callback_data: `edit_field_${id}_thc` }];

      return bot.sendMessage(chatId, `✅ Fiche sélectionnée: #${id}\nChoisis le champ :`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Nom", callback_data: `edit_field_${id}_name` }, { text: "Type", callback_data: `edit_field_${id}_type` }],
            line2,
            [{ text: "Description", callback_data: `edit_field_${id}_description` }, { text: "Image", callback_data: `edit_field_${id}_img` }],
            [{ text: "Terpènes", callback_data: `edit_field_${id}_terpenes` }, { text: "Arômes", callback_data: `edit_field_${id}_aroma` }],
            [{ text: "Effets", callback_data: `edit_field_${id}_effects` }, { text: "Conseils", callback_data: `edit_field_${id}_advice` }],
            [{ text: "❌ Annuler", callback_data: "edit_cancel" }],
          ],
        },
      });
    } catch (e) {
      return bot.sendMessage(chatId, `❌ edit_pick: ${e.message}`);
    }
  }

  /* ===== EDIT: field ===== */
  if (isAdmin(userId) && data.startsWith("edit_field_")) {
    const parts = data.split("_");
    const id = Number(parts[2]);
    const field = parts.slice(3).join("_");

    if (field === "type") {
      return bot.sendMessage(chatId, `🔁 Nouveau type pour #${id} :`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Hash", callback_data: `edit_settype_${id}_hash` }, { text: "Weed", callback_data: `edit_settype_${id}_weed` }],
            [{ text: "Extraction", callback_data: `edit_settype_${id}_extraction` }, { text: "WPFF", callback_data: `edit_settype_${id}_wpff` }],
            [{ text: "❌ Annuler", callback_data: "edit_cancel" }],
          ],
        },
      });
    }

    if (field === "micron") {
      return bot.sendMessage(chatId, `🔁 Nouveau micron pour #${id} :`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "120u", callback_data: `edit_setmicron_${id}_120u` }, { text: "90u", callback_data: `edit_setmicron_${id}_90u` }],
            [{ text: "73u", callback_data: `edit_setmicron_${id}_73u` }, { text: "45u", callback_data: `edit_setmicron_${id}_45u` }],
            [{ text: "Aucun", callback_data: `edit_setmicron_${id}_none` }],
            [{ text: "❌ Annuler", callback_data: "edit_cancel" }],
          ],
        },
      });
    }

    if (field === "weed_kind") {
      return bot.sendMessage(chatId, `🔁 Nouveau weed_kind pour #${id} :`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Indica", callback_data: `edit_setweedkind_${id}_indica` }, { text: "Sativa", callback_data: `edit_setweedkind_${id}_sativa` }],
            [{ text: "Hybrid", callback_data: `edit_setweedkind_${id}_hybrid` }],
            [{ text: "❌ Annuler", callback_data: "edit_cancel" }],
          ],
        },
      });
    }

    editWizard.set(chatId, { id, field, step: "value" });

    return bot.sendMessage(
      chatId,
      `✍️ Envoie la nouvelle valeur pour *${field}* (ou \`-\` pour vider).` +
        (["terpenes", "aroma", "effects"].includes(field) ? "\nFormat: `a,b,c`" : ""),
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "edit_cancel" }]] } }
    );
  }

  /* ===== EDIT: set type ===== */
  if (isAdmin(userId) && data.startsWith("edit_settype_")) {
    try {
      const parts = data.split("_");
      const id = Number(parts[2]);
      const newType = parts[3];
      if (!allowedTypes.has(newType)) return bot.sendMessage(chatId, "❌ Type invalide.");

      const card = await dbGetCard(id);
      if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");

      const patch = { type: newType };

      if (newType === "weed") {
        patch.micron = null;
        patch.weed_kind = card.weed_kind || "hybrid";
      } else {
        patch.weed_kind = null;
      }

      await dbUpdateCard(id, patch);
      return bot.sendMessage(chatId, `✅ Type mis à jour: #${id} → ${newType}`);
    } catch (e) {
      return bot.sendMessage(chatId, `❌ settype: ${e.message}`);
    }
  }

  /* ===== EDIT: set micron ===== */
  if (isAdmin(userId) && data.startsWith("edit_setmicron_")) {
    try {
      const parts = data.split("_");
      const id = Number(parts[2]);
      const micron = parts[3];
      const m = micron === "none" ? null : micron;
      if (m && !isMicron(m)) return bot.sendMessage(chatId, "❌ Micron invalide.");

      const card = await dbGetCard(id);
      if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");
      if (String(card.type).toLowerCase() === "weed") return bot.sendMessage(chatId, "❌ Weed n’a pas de micron.");

      await dbUpdateCard(id, { micron: m });
      return bot.sendMessage(chatId, `✅ Micron mis à jour: #${id} → ${m || "Aucun"}`);
    } catch (e) {
      return bot.sendMessage(chatId, `❌ setmicron: ${e.message}`);
    }
  }

  /* ===== EDIT: set weed_kind ===== */
  if (isAdmin(userId) && data.startsWith("edit_setweedkind_")) {
    try {
      const parts = data.split("_");
      const id = Number(parts[2]);
      const k = parts[3];
      if (!isWeedKind(k)) return bot.sendMessage(chatId, "❌ weed_kind invalide.");

      const card = await dbGetCard(id);
      if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");
      if (String(card.type).toLowerCase() !== "weed") return bot.sendMessage(chatId, "❌ weed_kind uniquement pour weed.");

      await dbUpdateCard(id, { weed_kind: k, micron: null });
      return bot.sendMessage(chatId, `✅ Weed_kind mis à jour: #${id} → ${weedKindLabel(k)}`);
    } catch (e) {
      return bot.sendMessage(chatId, `❌ setweedkind: ${e.message}`);
    }
  }
});

/* ===== texte (ADD + EDIT value) ===== */
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const text = (msg.text || "").trim();

  if (!isAdmin(userId)) return;
  if (!text || text.startsWith("/")) return;

  // ADD flow
  const addState = addWizard.get(chatId);
  if (addState) {
    if (addState.step === "name") {
      addState.data.name = text;
      addState.step = "type";
      addWizard.set(chatId, addState);
      return askType(chatId);
    }

    if (addState.step === "thc") {
      addState.data.thc = text;
      addState.step = "description";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "5/10 — Envoie la *description*.", { parse_mode: "Markdown" });
    }

    if (addState.step === "description") {
      addState.data.description = text;
      addState.step = "terpenes";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "6/10 — Terpènes (virgules) ou `-`", { parse_mode: "Markdown" });
    }

    if (addState.step === "terpenes") {
      addState.data.terpenes = text === "-" ? "" : text;
      addState.step = "aroma";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "7/10 — Arômes (virgules) ou `-`", { parse_mode: "Markdown" });
    }

    if (addState.step === "aroma") {
      addState.data.aroma = text === "-" ? "" : text;
      addState.step = "effects";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "8/10 — Effets (virgules) ou `-`", { parse_mode: "Markdown" });
    }

    if (addState.step === "effects") {
      addState.data.effects = text === "-" ? "" : text;
      addState.step = "advice";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "9/10 — Conseils / warning", { parse_mode: "Markdown" });
    }

    if (addState.step === "advice") {
      addState.data.advice = text;
      addState.step = "img";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "10/10 — Image URL (ou `-`)", { parse_mode: "Markdown" });
    }

    if (addState.step === "img") {
      addState.data.img = text === "-" ? "" : text;
      try {
        return await addFinish(chatId);
      } catch (e) {
        addWizard.delete(chatId);
        return bot.sendMessage(chatId, `❌ Ajout KO: ${e.message}`);
      }
    }
  }

  // EDIT value flow
  const ed = editWizard.get(chatId);
  if (ed && ed.step === "value") {
    try {
      const { id, field } = ed;
      const val = text === "-" ? "" : text;

      const card = await dbGetCard(id);
      if (!card) throw new Error("Fiche introuvable.");

      const patch = {};

      if (["terpenes", "aroma", "effects"].includes(field)) {
        patch[field] = val ? csvToArr(val) : [];
      } else if (field === "micron") {
        if (String(card.type).toLowerCase() === "weed") throw new Error("Weed n’a pas de micron.");
        if (val && !isMicron(val)) throw new Error("micron invalide");
        patch.micron = val ? val.toLowerCase() : null;
      } else if (field === "weed_kind") {
        if (String(card.type).toLowerCase() !== "weed") throw new Error("weed_kind uniquement pour weed.");
        if (val && !isWeedKind(val)) throw new Error("weed_kind invalide");
        patch.weed_kind = val ? val.toLowerCase() : "hybrid";
        patch.micron = null;
      } else if (field === "type") {
        const v = val.toLowerCase();
        if (v && !allowedTypes.has(v)) throw new Error("type invalide");
        patch.type = v;

        if (v === "weed") {
          patch.micron = null;
          patch.weed_kind = card.weed_kind || "hybrid";
        } else {
          patch.weed_kind = null;
        }
      } else {
        patch[field] = val;
      }

      await dbUpdateCard(id, patch);
      editWizard.delete(chatId);
      return bot.sendMessage(chatId, `✅ Modifié #${id} → ${field} mis à jour.`);
    } catch (e) {
      editWizard.delete(chatId);
      return bot.sendMessage(chatId, `❌ edit value: ${e.message}`);
    }
  }
});

/* ================== SERVER ================== */
app.listen(PORT, () => console.log("Serveur HarvestDex lancé sur le port", PORT));