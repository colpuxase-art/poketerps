const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

// =========================
// Static (mini-app)
// =========================
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const PORT = process.env.PORT || 3000;

// =========================
// ENV
// =========================
const TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const WEBAPP_URL = process.env.WEBAPP_URL || "";

const START_IMAGE_URL =
  process.env.START_IMAGE_URL || "https://i.postimg.cc/9Qp0JmJY/harvestdex-start.jpg";
const INFO_IMAGE_URL =
  process.env.INFO_IMAGE_URL || "https://i.postimg.cc/3w3qj7tK/harvestdex-info.jpg";
const SUPPORT_IMAGE_URL =
  process.env.SUPPORT_IMAGE_URL || "https://i.postimg.cc/8C6r8V5p/harvestdex-support.jpg";

// ✅ IMPORTANT Render: webhook recommandé
// Exemple: WEBHOOK_URL=https://poketerps.onrender.com
const WEBHOOK_URL = (process.env.WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL || "").trim();
// Sur Render, RENDER_EXTERNAL_URL existe souvent: on l'utilise automatiquement pour éviter le polling et les erreurs 409.

if (!TOKEN) {
  console.error("❌ BOT_TOKEN manquant.");
  process.exit(1);
}

const supabaseReady = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE);
if (!supabaseReady) {
  console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE manquant.");
}

const sb = supabaseReady
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } })
  : null;

function assertSupabase() {
  if (!sb) throw new Error("Supabase non configuré (variables manquantes).");
}

// =========================
// Admin
// =========================
const ADMIN_IDS = new Set([6675436692]); // ✅ TON USER ID
const isAdminUser = (userId) => ADMIN_IDS.has(Number(userId));

// =========================
// Subcategories (app + bot)
// =========================
const SUBCATEGORIES = [
  // HASH
  { id: "dry_sift", type: "hash", label: "Dry Sift", sort: 10 },
  { id: "static_sift", type: "hash", label: "Static Sift", sort: 15 },
  { id: "kief_pollen", type: "hash", label: "Kief / Pollen", sort: 18 },
  { id: "ice_o_lator", type: "hash", label: "Ice-O-Lator / Bubble", sort: 20 },
  { id: "full_melt", type: "hash", label: "Full Melt", sort: 25 },
  { id: "temple_ball", type: "hash", label: "Temple Ball", sort: 30 },
  { id: "piatella", type: "hash", label: "Piatella", sort: 35 },
  { id: "charas", type: "hash", label: "Charas / Hand Rubbed", sort: 40 },
  { id: "pressed_hash", type: "hash", label: "Pressed Hash", sort: 45 },

  // WEED (style de culture)
  { id: "indoor", type: "weed", label: "Indoor", sort: 10 },
  { id: "greenhouse", type: "weed", label: "Greenhouse", sort: 20 },
  { id: "outdoor", type: "weed", label: "Outdoor", sort: 30 },
  { id: "living_soil", type: "weed", label: "Living Soil", sort: 40 },
  { id: "organic", type: "weed", label: "Organic", sort: 50 },
  { id: "hydro", type: "weed", label: "Hydro", sort: 60 },

  // EXTRACTION
  { id: "rosin", type: "extraction", label: "Rosin", sort: 10 },
  { id: "live_rosin", type: "extraction", label: "Live Rosin", sort: 15 },
  { id: "resin", type: "extraction", label: "Resin", sort: 20 },
  { id: "live_resin", type: "extraction", label: "Live Resin", sort: 25 },
  { id: "bho", type: "extraction", label: "BHO", sort: 30 },
  { id: "shatter", type: "extraction", label: "Shatter", sort: 35 },
  { id: "wax", type: "extraction", label: "Wax / Budder", sort: 40 },
  { id: "crumble", type: "extraction", label: "Crumble", sort: 45 },
  { id: "diamonds", type: "extraction", label: "Diamonds", sort: 60 },
  { id: "sauce", type: "extraction", label: "Sauce", sort: 65 },
  { id: "distillate", type: "extraction", label: "Distillate", sort: 70 },
  { id: "rso", type: "extraction", label: "RSO", sort: 80 },

  // WPFF
  { id: "wpff_fresh_frozen", type: "wpff", label: "Fresh Frozen", sort: 10 },
  { id: "wpff_whole_plant", type: "wpff", label: "Whole Plant", sort: 15 },
  { id: "wpff_first_pull", type: "wpff", label: "First Pull", sort: 20 },
  { id: "wpff_full_spectrum", type: "wpff", label: "Full Spectrum", sort: 30 },
];

app.get("/api/subcategories", (req, res) => res.json(SUBCATEGORIES));

// =========================
// Helpers
// =========================
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

// =========================
// DB HELPERS
// =========================
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

// =========================
// FEATURED (Rare du moment)
// =========================
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

// =========================
// API: cards + featured
// =========================
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

// =========================
// Favorites (Mon Dex)
// =========================
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
    if (e1) throw e1;

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

    const { data: cards, error: e2 } = await sb
      .from("cards")
      .select("*")
      .in("id", ids)
      .order("created_at", { ascending: false });
    if (e2) throw e2;

    res.json(cards || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =========================
// TELEGRAM BOT (polling/webhook)
// =========================
let bot;

if (WEBHOOK_URL) {
  bot = new TelegramBot(TOKEN);
  const hookPath = `/bot${TOKEN}`;
  bot.setWebHook(`${WEBHOOK_URL}${hookPath}`);

  app.post(hookPath, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });

  console.log("✅ Bot en mode WEBHOOK:", `${WEBHOOK_URL}${hookPath}`);
} else {
  bot = new TelegramBot(TOKEN, { polling: true });
  console.log("✅ Bot en mode POLLING (pas recommandé sur Render)");
}


// =========================
// Safe Telegram send (évite crash Render)
// =========================
function isParseEntityError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("can't parse entities") || msg.includes("impossible d'analyser les entités");
}

async function safeSendMessage(chatId, text, opts = {}) {
  try {
    return await bot.sendMessage(chatId, text, opts);
  } catch (e) {
    console.warn("⚠️ sendMessage failed:", e.message);
    if (opts?.parse_mode && isParseEntityError(e)) {
      const o2 = { ...opts };
      delete o2.parse_mode;
      try { return await bot.sendMessage(chatId, text, o2); } catch (e2) { console.warn("⚠️ retry sendMessage failed:", e2.message); }
    }
    return null;
  }
}

async function safeSendPhoto(chatId, photo, opts = {}) {
  try {
    return await bot.sendPhoto(chatId, photo, opts);
  } catch (e) {
    console.warn("⚠️ sendPhoto failed:", e.message);
    const caption = opts?.caption ? String(opts.caption) : "—";
    const o2 = { ...opts };
    delete o2.caption;
    await safeSendMessage(chatId, caption, o2);
    return null;
  }
}

bot.on("polling_error", (e) => console.warn("⚠️ polling_error:", e?.message || e));
process.on("unhandledRejection", (e) => console.warn("⚠️ unhandledRejection:", e?.message || e));
process.on("uncaughtException", (e) => console.warn("⚠️ uncaughtException:", e?.message || e));

// =========================
// /start menu
// =========================
function buildStartKeyboard(userId) {
  const admin = isAdminUser(userId);

  const keyboard = [
    [{ text: "📘 Ouvrir le Dex", web_app: { url: WEBAPP_URL } }],
    [
      { text: "⭐ Mon Dex", web_app: { url: WEBAPP_URL + "#mydex" } },
      { text: "👤 Profil", web_app: { url: WEBAPP_URL + "#profile" } },
    ],
    [{ text: "ℹ️ Informations", callback_data: "menu_info" }],
    [{ text: "🤝 Nous soutenir", callback_data: "menu_support" }],
  ];

  if (admin) keyboard.push([{ text: "🧰 Admin", callback_data: "menu_admin" }]);

  return keyboard;
}

function sendStartMenu(chatId, userId) {
  const caption = `🧬 *PokéTerps / HarvestDex*

Collectionne tes fiches, ajoute-les à *Mon Dex* et explore les catégories 🔥`;

  const keyboard = buildStartKeyboard(userId);

  return safeSendPhoto(chatId, START_IMAGE_URL, {
      caption,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    }).then((r)=>{ if(r) return r; return safeSendMessage(chatId, caption, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard },
      }); });
}

bot.onText(/^\/start$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  sendStartMenu(chatId, userId);
});

// =========================
// ADMIN COMMAND LIST (clean)
// =========================
bot.onText(/^\/myid$/, (msg) => {
  bot.sendMessage(msg.chat.id, `✅ user_id = ${msg.from?.id}\n✅ chat_id = ${msg.chat.id}`);
});

bot.onText(/^\/adminhelp$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  const txt =
    `👑 *Commandes Admin*

✅ /dbtest *(test Supabase)*
✅ /stat *(stats)*
✅ /list [hash|weed|extraction|wpff|120u|90u|73u|45u|indica|sativa|hybrid]
✅ /addform *(ajout guidé)*
✅ /editform *(modif guidée)*
✅ /delform *(suppression guidée)*
✅ /edit id field value
✅ /del id

✨ *Rare du moment*
✅ /rare id (titre optionnel)
✅ /unrare
✅ /rareinfo

*fields /edit:* name,type,micron,weed_kind,thc,description,img,advice,terpenes,aroma,effects`;

  bot.sendMessage(chatId, txt, { parse_mode: "Markdown" });
});

bot.onText(/^\/dbtest$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return;

  try {
    assertSupabase();
    const { error } = await sb.from("cards").select("id").limit(1);
    if (error) throw error;
    bot.sendMessage(chatId, "✅ Supabase OK (table cards accessible)");
  } catch (e) {
    bot.sendMessage(chatId, `❌ Supabase KO: ${e.message}`);
  }
});

bot.onText(/^\/stat$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    assertSupabase();
    const { count, error } = await sb.from("track_events").select("*", { count: "exact", head: true });
    if (error) throw error;
    bot.sendMessage(chatId, `📊 *Stats*\n\nTotal events: *${count || 0}*`, { parse_mode: "Markdown" });
  } catch (e) {
    bot.sendMessage(chatId, `❌ /stat: ${e.message}`);
  }
});

// =========================
// Rare commands
// =========================
bot.onText(/^\/rare\s+(\d+)(?:\s+([\s\S]+))?$/m, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const id = Number(match[1]);
    const title = (match[2] || "").trim();

    const card = await dbGetCard(id);
    if (!card) return bot.sendMessage(chatId, "❌ ID introuvable.");

    const updated = await dbSetFeatured(id, title || "✨ Shiny du moment");

    const extra =
      updated.type === "weed"
        ? updated.weed_kind
          ? ` • ${updated.weed_kind}`
          : ""
        : updated.micron
        ? ` • ${updated.micron}`
        : "";

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
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

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
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const c = await dbGetFeatured();
    if (!c) return bot.sendMessage(chatId, "Aucune Rare du moment actuellement.");

    const extra =
      c.type === "weed"
        ? c.weed_kind
          ? ` • ${c.weed_kind}`
          : ""
        : c.micron
        ? ` • ${c.micron}`
        : "";

    bot.sendMessage(chatId, `✨ Rare actuelle:\n#${c.id} — ${c.name}\n${typeLabel(c.type)}${extra}\nTitre: ${c.featured_title || "✨ Shiny du moment"}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /rareinfo: ${e.message}`);
  }
});

// =========================
// list / edit / del commands
// =========================
bot.onText(/^\/list(?:\s+(\w+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

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
        return bot.sendMessage(chatId, "❌ Filtre inconnu. Ex: /list weed | /list 90u | /list indica");
      }
    }

    if (!cards.length) return bot.sendMessage(chatId, "Aucune fiche.");

    const lines = cards
      .slice(0, 80)
      .map((c) => {
        const t = String(c.type || "");
        const extra =
          t === "weed" ? (c.weed_kind ? ` • ${c.weed_kind}` : "") : (c.micron ? ` • ${c.micron}` : "");
        return `#${c.id} • ${t}${extra} • ${c.name}`;
      })
      .join("\n");

    bot.sendMessage(chatId, `📚 Fiches (${cards.length})\n\n${lines}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /list: ${e.message}`);
  }
});

bot.onText(/^\/del\s+(\d+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

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

bot.onText(/^\/edit\s+(\d+)\s+(\w+)\s+([\s\S]+)$/m, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const id = Number(match[1]);
    const field = match[2].toLowerCase();
    const value = (match[3] || "").trim();

    const allowedFields = new Set([
      "name","type","micron","weed_kind","thc","description","img","advice","terpenes","aroma","effects",
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
      if (String(card.type).toLowerCase() === "weed") return bot.sendMessage(chatId, "❌ Weed n'a pas de micron.");
      patch.micron = v;
    } else if (field === "weed_kind") {
      const v = value === "-" ? null : value.toLowerCase();
      if (v && !isWeedKind(v)) return bot.sendMessage(chatId, "❌ weed_kind invalide: indica|sativa|hybrid (ou `-`)");
      if (String(card.type).toLowerCase() !== "weed") return bot.sendMessage(chatId, "❌ weed_kind seulement pour weed.");
      patch.weed_kind = v || "hybrid";
    } else if (["terpenes","aroma","effects"].includes(field)) {
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

// =========================
// Wizards (add/edit/del form)
// =========================
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

  const msg =
    `✅ *Fiche ajoutée !*\n\n` +
    `#${card.id} — *${card.name}*\n` +
    `Catégorie: *${typeLabel(card.type)}${extra}*\n` +
    `${card.thc}\n\n` +
    `🧬 ${card.description}\n` +
    `🌿 Terpènes: ${card.terpenes?.length ? card.terpenes.join(", ") : "—"}\n` +
    `👃 Arômes: ${card.aroma?.length ? card.aroma.join(", ") : "—"}\n` +
    `🧠 Effets: ${card.effects?.length ? card.effects.join(", ") : "—"}\n` +
    `⚠️ ${card.advice}`;

  bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
}

bot.onText(/^\/addform$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  addWizard.set(chatId, { step: "name", data: {} });
  bot.sendMessage(
    chatId,
    "📝 *Ajout d'une fiche* (formulaire)\n\n1/10 — Envoie le *nom*.\nEx: `Static Hash Premium`",
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "add_cancel" }]] },
    }
  );
});

bot.onText(/^\/editform$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

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
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

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

// =========================
// SINGLE callback_query handler (menus + wizards)
// =========================
bot.on("callback_query", async (query) => {
  const chatId = query?.message?.chat?.id;
  const userId = query?.from?.id;
  const data = query?.data || "";

  if (!chatId) return;

  try {
    await bot.answerCallbackQuery(query.id);
  } catch {}

  // ===== MENUS =====
  if (data === "menu_back") return sendStartMenu(chatId, userId);

  if (data === "menu_info") {
    const caption =
      `ℹ️ *Informations*\n\n` +
      `PokéTerps / HarvestDex est un projet éducatif.\n` +
      `Tu peux consulter les fiches, les terpènes, les arômes et les effets.\n\n` +
      `⚠️ *Disclaimer*\n` +
      `• Aucune vente ici.\n` +
      `• Informations uniquement.\n` +
      `• Les effets varient selon la personne.\n` +
      `• Respecte les lois de ton pays.\n\n` +
      `📌 Weed: indica/sativa/hybrid (dans la fiche)\n` +
      `📌 Hash/Extraction/WPFF: détails (microns et infos) dans la fiche`;

    return bot.sendPhoto(chatId, INFO_IMAGE_URL, {
      caption,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_back" }]] },
    });
  }

  if (data === "menu_support") {
    const caption = `🤝 *Nous soutenir*\n\nChoisis une option 👇`;

    return bot.sendPhoto(chatId, SUPPORT_IMAGE_URL, {
      caption,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📲 Nous suivre", callback_data: "support_follow" }],
          [{ text: "🎮 Jouer", callback_data: "support_play" }],
          [{ text: "💸 Don", callback_data: "support_donate" }],
          [{ text: "🤝 Nos partenaires", callback_data: "support_partners" }],
          [{ text: "⬅️ Retour", callback_data: "menu_back" }],
        ],
      },
    });
  }

  if (data === "support_partners") {
    return bot.sendMessage(
      chatId,
      `🤝 *Nos partenaires*\n\nAucun partenaire pour le moment.\nVeuillez nous contacter si vous voulez apparaître ici.`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] },
      }
    );
  }

  if (data === "support_follow") {
    return bot.sendMessage(chatId, "📲 Nous suivre : (mets tes liens ici)", {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] },
    });
  }

  if (data === "support_play") {
    return bot.sendMessage(chatId, "🎮 Jouer : (mets tes jeux/liens ici)", {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] },
    });
  }

  if (data === "support_donate") {
    return bot.sendMessage(chatId, "💸 Don : (mets ton lien TWINT/crypto/etc ici)", {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] },
    });
  }

  if (data === "menu_admin") {
    if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");
    return bot.sendMessage(chatId, "🧰 Admin: utilise /adminhelp", {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_back" }]] },
    });
  }

  // ===== WIZARDS =====
  if (isAdminUser(userId) && data === "add_cancel") return addCancel(chatId);

  if (isAdminUser(userId) && data.startsWith("add_type_")) {
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

  if (isAdminUser(userId) && data.startsWith("add_weedkind_")) {
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

  if (isAdminUser(userId) && data.startsWith("add_micron_")) {
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

  if (isAdminUser(userId) && data === "edit_cancel") return editCancel(chatId);
  if (isAdminUser(userId) && data === "del_cancel") return delCancel(chatId);

  if (isAdminUser(userId) && data.startsWith("del_pick_")) {
    try {
      const id = Number(data.replace("del_pick_", ""));
      const card = await dbGetCard(id);
      if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");

      delWizard.set(chatId, { id });

      const extra =
        card.type === "weed"
          ? card.weed_kind
            ? ` • ${card.weed_kind}`
            : ""
          : card.micron
          ? ` • ${card.micron}`
          : "";

      return bot.sendMessage(chatId, `⚠️ Confirme la suppression :\n\n#${card.id} — ${card.name}\n(${card.type}${extra})`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ CONFIRMER", callback_data: `del_confirm_${id}` }],
            [{ text: "❌ Annuler", callback_data: "del_cancel" }],
          ],
        },
      });
    } catch (e) {
      return bot.sendMessage(chatId, `❌ del_pick: ${e.message}`);
    }
  }

  if (isAdminUser(userId) && data.startsWith("del_confirm_")) {
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

  if (isAdminUser(userId) && data.startsWith("edit_pick_")) {
    try {
      const id = Number(data.replace("edit_pick_", ""));
      const card = await dbGetCard(id);
      if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");

      const isWeed = String(card.type).toLowerCase() === "weed";
      const line2 = isWeed
        ? [
            { text: "Weed Kind", callback_data: `edit_field_${id}_weed_kind` },
            { text: "THC", callback_data: `edit_field_${id}_thc` },
          ]
        : [
            { text: "Micron", callback_data: `edit_field_${id}_micron` },
            { text: "THC", callback_data: `edit_field_${id}_thc` },
          ];

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

  if (isAdminUser(userId) && data.startsWith("edit_field_")) {
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
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "edit_cancel" }]] },
      }
    );
  }

  if (isAdminUser(userId) && data.startsWith("edit_settype_")) {
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

  if (isAdminUser(userId) && data.startsWith("edit_setmicron_")) {
    try {
      const parts = data.split("_");
      const id = Number(parts[2]);
      const micron = parts[3];
      const m = micron === "none" ? null : micron;
      if (m && !isMicron(m)) return bot.sendMessage(chatId, "❌ Micron invalide.");

      const card = await dbGetCard(id);
      if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");
      if (String(card.type).toLowerCase() === "weed") return bot.sendMessage(chatId, "❌ Weed n'a pas de micron.");

      await dbUpdateCard(id, { micron: m });
      return bot.sendMessage(chatId, `✅ Micron mis à jour: #${id} → ${m || "Aucun"}`);
    } catch (e) {
      return bot.sendMessage(chatId, `❌ setmicron: ${e.message}`);
    }
  }

  if (isAdminUser(userId) && data.startsWith("edit_setweedkind_")) {
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

// =========================
// Text steps (ADD + EDIT value)
// =========================
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const text = (msg.text || "").trim();

  if (!isAdminUser(userId)) return;
  if (text.startsWith("/")) return;

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
        if (String(card.type).toLowerCase() === "weed") throw new Error("Weed n'a pas de micron.");
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

// =========================
// Start server last
// =========================
app.listen(PORT, () => console.log("Serveur PokéTerps lancé sur le port", PORT));
