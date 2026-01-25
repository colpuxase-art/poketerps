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

/* ================== BOT ================== */
const bot = new TelegramBot(TOKEN, { polling: true });

bot.on("polling_error", (err) => {
  console.error("❌ polling_error:", err?.response?.body || err);
});

/* ================== ADMIN CONFIG ================== */
const ADMIN_IDS = new Set([6675436692]); // ton ID
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

const typeLabel = (t) =>
  ({ hash: "Hash", weed: "Weed", extraction: "Extraction", wpff: "WPFF" }[t] || t);
const weedKindLabel = (k) =>
  ({ indica: "Indica", sativa: "Sativa", hybrid: "Hybrid" }[k] || k);

/* ================== DB HELPERS ================== */
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

/* ================== FEATURED ================== */
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

/* ================== API MINI-APP ================== */
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

function safeSendPhotoOrText(chatId, photoUrl, caption, parse_mode, reply_markup, fallbackText) {
  return bot
    .sendPhoto(chatId, photoUrl, { caption, parse_mode, reply_markup })
    .catch(() => bot.sendMessage(chatId, fallbackText || caption.replace(/\*/g, ""), { reply_markup }));
}

function sendStartMenu(chatId, userId) {
  const keyboard = startKeyboard(userId);

  return safeSendPhotoOrText(
    chatId,
    START_IMAGE_URL,
    "🧬 *PokéTerps*\n\n" +
      "Collectionne les fiches, ajoute-les à *Mon Dex* et explore les catégories 🔥\n\n" +
      "_Info éducative uniquement (aucune vente)._",
    "Markdown",
    { inline_keyboard: keyboard },
    "🧬 PokéTerps\n\nChoisis une section 👇"
  );
}

function sendInfoMenu(chatId) {
  const kb = { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_start" }]] };

  return bot
    .sendPhoto(chatId, INFO_IMAGE_URL, {
      caption:
        "ℹ️ *Informations — PokéTerps*\n\n" +
        "📌 *But :* fiches éducatives sur THC / terpènes / arômes / effets (ressentis).\n\n" +
        "🗂️ *Catégories :*\n" +
        "• *Hash* (types de hash)\n" +
        "• *Weed* (indica/sativa/hybrid)\n" +
        "• *Extraction* (rosin, resin, etc.)\n" +
        "• *WPFF* (fresh frozen / whole plant...)\n\n" +
        "⚠️ *Disclaimer :* Les effets varient selon la personne. Respecte la loi.\n",
      parse_mode: "Markdown",
      reply_markup: kb,
    })
    .catch(() =>
      bot.sendMessage(
        chatId,
        "ℹ️ Informations — PokéTerps\n\n" +
          "But : fiches éducatives sur THC / terpènes / arômes / effets.\n\n" +
          "⚠️ Disclaimer : Les effets varient selon la personne. Respecte la loi.",
        { reply_markup: kb }
      )
    );
}

function sendSupportMenu(chatId) {
  const kb = {
    inline_keyboard: [
      [{ text: "📣 Nous suivre", callback_data: "support_follow" }],
      [{ text: "🕹️ Jouer", callback_data: "support_play" }],
      [{ text: "💝 Don", callback_data: "support_donate" }],
      [{ text: "🤝 Nos partenaires", callback_data: "support_partners" }],
      [{ text: "⬅️ Retour", callback_data: "menu_start" }],
    ],
  };

  return bot
    .sendPhoto(chatId, SUPPORT_IMAGE_URL, {
      caption: "🤝 *Nous soutenir*\n\nChoisis une option :",
      parse_mode: "Markdown",
      reply_markup: kb,
    })
    .catch(() => bot.sendMessage(chatId, "🤝 Nous soutenir\n\nChoisis une option :", { reply_markup: kb }));
}

function sendPartnersMenu(chatId) {
  const kb = { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] };
  return bot.sendMessage(
    chatId,
    "🤝 *Nos partenaires*\n\n" +
      "Pour l’instant, *aucun partenaire*.\n" +
      "Veuillez nous contacter si vous voulez apparaître ici.",
    { parse_mode: "Markdown", reply_markup: kb }
  );
}

function sendAdminMenu(chatId, userId) {
  if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  const kb = {
    inline_keyboard: [
      [{ text: "📜 Voir commandes Admin", callback_data: "admin_help" }],
      [{ text: "📊 Statistiques (/stat)", callback_data: "admin_stat" }],
      [{ text: "⬅️ Retour", callback_data: "menu_start" }],
    ],
  };

  return bot
    .sendPhoto(chatId, ADMIN_IMAGE_URL, {
      caption: "🧰 *Admin — PokéTerps*\n\nGestion des fiches + stats.",
      parse_mode: "Markdown",
      reply_markup: kb,
    })
    .catch(() => bot.sendMessage(chatId, "🧰 Admin — PokéTerps\n\nGestion des fiches + stats.", { reply_markup: kb }));
}

/* ================== /start ================= */
bot.onText(/^\/start(?:\s|$)/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  sendStartMenu(chatId, userId);
});

/* ================== CALLBACKS ================= */
bot.on("callback_query", async (query) => {
  const chatId = query?.message?.chat?.id;
  const userId = query?.from?.id;
  if (!chatId) return;

  try {
    await bot.answerCallbackQuery(query.id);
  } catch {}

  const data = query.data || "";

  if (data === "menu_start") return sendStartMenu(chatId, userId);
  if (data === "menu_info") return sendInfoMenu(chatId);
  if (data === "menu_support") return sendSupportMenu(chatId);
  if (data === "menu_admin") return sendAdminMenu(chatId, userId);

  if (data === "support_follow") {
    return bot.sendMessage(
      chatId,
      "📣 *Nous suivre*\n\n" +
        "• Instagram : (à ajouter)\n" +
        "• TikTok : (à ajouter)\n" +
        "• Telegram : (à ajouter)\n\n" +
        "Envoie-moi tes liens et je te les mets proprement.",
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] } }
    );
  }

  if (data === "support_play") {
    return bot.sendMessage(
      chatId,
      "🕹️ *Jouer*\n\n" + "Ici on mettra les jeux pour gagner des récompenses.\n" + "_Bientôt disponible._",
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] } }
    );
  }

  if (data === "support_donate") {
    return bot.sendMessage(
      chatId,
      "💝 *Don*\n\n" + "Bientôt : lien de don / crypto / TWINT.\n" + "Envoie-moi ton lien et je le mets.",
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] } }
    );
  }

  if (data === "support_partners") return sendPartnersMenu(chatId);

  if (data === "admin_help") {
    if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

    // Version SAFE (pas de HTML/Markdown qui casse)
    const text =
      "👑 Commandes Admin PokéTerps\n\n" +
      "✅ /myid\n" +
      "✅ /dbtest (test Supabase)\n" +
      "✅ /stat\n\n" +
      "📚 Gestion\n" +
      "✅ /list [hash|weed|extraction|wpff|120u|90u|73u|45u|indica|sativa|hybrid]\n" +
      "✅ /edit id field value\n" +
      "✅ /del id\n\n" +
      "✨ Rare du moment\n" +
      "✅ /rare id (titre optionnel)\n" +
      "✅ /unrare\n" +
      "✅ /rareinfo\n\n" +
      "Fields /edit : name, type, micron, weed_kind, thc, description, img, advice, terpenes, aroma, effects";

    return bot.sendMessage(chatId, text);
  }

  if (data === "admin_stat") {
    if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");
    return bot.sendMessage(chatId, "📊 Utilise la commande : /stat");
  }
});

/* ================== COMMANDES ================== */
bot.onText(/^\/myid$/, (msg) => {
  bot.sendMessage(msg.chat.id, `Ton Telegram ID = ${msg.from?.id}\nChat ID = ${msg.chat.id}`);
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
      "📊 *Stats — PokéTerps*\n\n" +
        `• Fiches: *${cardsCount ?? 0}*\n` +
        `• Favoris: *${favCount ?? 0}*\n` +
        `• Rare du moment: *${featured ? "#" + featured.id + " " + featured.name : "Aucune"}*\n`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    bot.sendMessage(chatId, `❌ /stat: ${e.message}`);
  }
});

/* ------------------ /list ------------------ */
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
        return bot.sendMessage(chatId, "❌ Filtre inconnu. Ex: /list weed, /list 90u, /list indica");
      }
    }

    if (!cards.length) return bot.sendMessage(chatId, "Aucune fiche.");

    const lines = cards
      .slice(0, 80)
      .map((c) => {
        const t = String(c.type || "");
        const extra =
          t === "weed"
            ? c.weed_kind ? ` • ${weedKindLabel(String(c.weed_kind).toLowerCase())}` : ""
            : c.micron ? ` • ${String(c.micron)}` : "";
        return `#${c.id} • ${t}${extra} • ${c.name}`;
      })
      .join("\n");

    bot.sendMessage(chatId, `📚 Fiches (${cards.length})\n\n${lines}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /list: ${e.message}`);
  }
});

/* ------------------ /del ------------------ */
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

/* ------------------ /edit ------------------ */
bot.onText(/^\/edit\s+(\d+)\s+(\w+)\s+([\s\S]+)$/m, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const id = Number(match[1]);
    const field = String(match[2] || "").toLowerCase();
    const value = String(match[3] || "").trim();

    const allowedFields = new Set([
      "name",
      "type",
      "micron",
      "weed_kind",
      "thc",
      "description",
      "img",
      "advice",
      "terpenes",
      "aroma",
      "effects",
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

/* ================== Rare du moment ================== */
bot.onText(/^\/rare\s+(\d+)(?:\s+([\s\S]+))?$/m, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdmin(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const id = Number(match[1]);
    const title = String(match[2] || "").trim();

    const card = await dbGetCard(id);
    if (!card) return bot.sendMessage(chatId, "❌ ID introuvable.");

    const updated = await dbSetFeatured(id, title || "✨ Shiny du moment");

    const extra =
      updated.type === "weed"
        ? updated.weed_kind ? ` • ${weedKindLabel(String(updated.weed_kind).toLowerCase())}` : ""
        : updated.micron ? ` • ${String(updated.micron)}` : "";

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
        ? c.weed_kind ? ` • ${weedKindLabel(String(c.weed_kind).toLowerCase())}` : ""
        : c.micron ? ` • ${String(c.micron)}` : "";

    bot.sendMessage(
      chatId,
      `✨ Rare actuelle:\n#${c.id} — ${c.name}\n${typeLabel(c.type)}${extra}\nTitre: ${c.featured_title || "✨ Shiny du moment"}`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    bot.sendMessage(chatId, `❌ /rareinfo: ${e.message}`);
  }
});

/* ================== SERVER ================== */
app.listen(PORT, () => console.log("Serveur PokéTerps lancé sur le port", PORT));
