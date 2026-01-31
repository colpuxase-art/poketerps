// index.js — HarvestDex (bot + mini-app) — prêt à copier
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json({ limit: "2mb" }));

/* =========================
   PROTECTION (Render)
   ========================= */
process.on("unhandledRejection", (reason) => console.error("❌ Unhandled Rejection:", reason));
process.on("uncaughtException", (err) => console.error("❌ Uncaught Exception:", err));

/* =========================
   Static (mini-app)
   ========================= */
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const PORT = process.env.PORT || 3000;

/* =========================
   ENV
   ========================= */
const TOKEN = (process.env.BOT_TOKEN || "").trim();
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE = (process.env.SUPABASE_SERVICE_ROLE || "").trim();
const WEBAPP_URL = (process.env.WEBAPP_URL || "").trim();

// Webhook Render (recommandé) — ex: https://harvestdex.onrender.com
const WEBHOOK_URL = (process.env.WEBHOOK_URL || "").trim();

// Images
const START_IMAGE_URL =
  process.env.START_IMAGE_URL || "https://i.postimg.cc/25R8m7h5/3c27c60b-5059-43f4-b725-72cf49c358db.jpg";
const INFO_IMAGE_URL =
  process.env.INFO_IMAGE_URL || "https://i.postimg.cc/3w3qj7tK/harvestdex-info.jpg";
const SUPPORT_IMAGE_URL =
  process.env.SUPPORT_IMAGE_URL || "https://i.postimg.cc/8C6r8V5p/harvestdex-support.jpg";
const ADMIN_IMAGE_URL =
  process.env.ADMIN_IMAGE_URL || "https://i.postimg.cc/T3w2VY8Q/harvestdex-admin.jpg";

// GAMEE / Jouer (ton lien parrainage)
const GAMEE_PLAY_URL =
  (process.env.GAMEE_PLAY_URL || "").trim() ||
  "https://t.me/gamee/start?startapp=eyJyZWYiOjY2NzU0MzY2OTJ9";

// Partner of the moment (simple via ENV, tu pourras le mettre en DB plus tard)
const PARTNER_TITLE = (process.env.PARTNER_TITLE || "Partenaire du moment").trim();
const PARTNER_TEXT = (process.env.PARTNER_TEXT || "Bientôt disponible.").trim();
const PARTNER_URL = (process.env.PARTNER_URL || "").trim();
const PARTNER_IMAGE_URL = (process.env.PARTNER_IMAGE_URL || "").trim();

if (!TOKEN) {
  console.error("❌ BOT_TOKEN manquant.");
  process.exit(1);
}
if (!WEBAPP_URL) {
  console.error("❌ WEBAPP_URL manquant.");
  process.exit(1);
}

const supabaseReady = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE);
if (!supabaseReady) console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE manquant.");

const sb = supabaseReady
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } })
  : null;

function assertSupabase() {
  if (!sb) throw new Error("Supabase non configuré (variables manquantes).");
}

/* =========================
   Admin
   ========================= */
const ADMIN_IDS = new Set([6675436692]); // ✅ TON user id
const isAdminUser = (userId) => ADMIN_IDS.has(Number(userId));

/* =========================
   Helpers
   ========================= */
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

/* =========================
   DB HELPERS
   ========================= */
async function dbGetActiveSeasonId() {
  assertSupabase();
  const { data, error } = await sb
    .from("seasons")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

async function dbListSubcategories(type) {
  assertSupabase();
  let q = sb
    .from("subcategories")
    .select("id,type,label,sort,is_active")
    .eq("is_active", true)
    .order("sort", { ascending: true })
    .order("label", { ascending: true });

  if (type) q = q.eq("type", type);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function dbListCards() {
  assertSupabase();
  // FK cards.subcategory_id -> subcategories.id
  const { data, error } = await sb
    .from("cards")
    .select("*, subcategories (id,type,label,sort)")
    .order("id", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function dbGetCard(id) {
  assertSupabase();
  const { data, error } = await sb
    .from("cards")
    .select("*, subcategories (id,type,label,sort)")
    .eq("id", id)
    .maybeSingle();
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

/* =========================
   FEATURED (Legendary / Rare du moment)
   ========================= */
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

  const patch = { is_featured: true, featured_title: title || "✨ Légendaire du moment" };
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

/* =========================
   API — subcategories/cards/featured/partner
   ========================= */
app.get("/api/subcategories", async (req, res) => {
  try {
    if (!sb) return res.json([]);
    const type = (req.query.type || "").toString().trim().toLowerCase();
    const rows = await dbListSubcategories(type || undefined);
    res.json(
      rows.map((r) => ({
        id: r.id,
        type: r.type,
        label: r.label,
        sort: r.sort,
      }))
    );
  } catch (e) {
    console.error("❌ /api/subcategories:", e.message);
    res.status(500).json({ error: "db_error", message: e.message });
  }
});

app.get("/api/cards", async (req, res) => {
  try {
    const cards = await dbListCards();
    const mapped = cards.map((c) => ({
      ...c,
      desc: c.description ?? "—",
      subcategory_label: c.subcategories?.label || null,
      subcategory_type: c.subcategories?.type || null,
    }));
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

// Partner du moment (simple via ENV)
app.get("/api/partner", (req, res) => {
  res.json({
    title: PARTNER_TITLE,
    text: PARTNER_TEXT,
    url: PARTNER_URL || null,
    image: PARTNER_IMAGE_URL || null,
  });
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

    const { data: favs, error: e1 } = await sb
      .from("favorites")
      .select("card_id")
      .eq("user_id", user_id);
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

/* =========================
   TELEGRAM BOT (polling/webhook)
   ========================= */
let bot;

if (WEBHOOK_URL) {
  bot = new TelegramBot(TOKEN);
  const hookPath = `/bot${TOKEN}`;
  bot.setWebHook(`${WEBHOOK_URL}${hookPath}`);

  // IMPORTANT: Telegram envoie du JSON => express.json() déjà OK
  app.post(hookPath, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });

  console.log("✅ Bot en mode WEBHOOK:", `${WEBHOOK_URL}${hookPath}`);
} else {
  bot = new TelegramBot(TOKEN, { polling: true });
  console.log("✅ Bot en mode POLLING (évite sur Render si tu peux)");
}

/* =========================
   Menus bot
   ========================= */
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
  const caption =
    "🌾 *HarvestDex*\n\n" +
    "Collectionne les fiches, ajoute-les à *Mon Dex* et explore les catégories 🔥\n\n" +
    "_Info éducative uniquement (aucune vente)._";

  const keyboard = buildStartKeyboard(userId);

  return bot
    .sendPhoto(chatId, START_IMAGE_URL, {
      caption,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    })
    .catch(() => {
      return bot.sendMessage(chatId, caption, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard },
      });
    });
}

function sendInfoMenu(chatId) {
  const caption =
    "ℹ️ *Informations — HarvestDex*\n\n" +
    "📌 *But :* fiches éducatives sur THC / terpènes / arômes / effets (ressentis).\n\n" +
    "⚠️ *Disclaimer :* Les effets varient selon la personne. Respecte la loi.\n";

  const kb = [[{ text: "⬅️ Retour", callback_data: "menu_start" }]];

  return bot
    .sendPhoto(chatId, INFO_IMAGE_URL, {
      caption,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: kb },
    })
    .catch(() => bot.sendMessage(chatId, caption, { parse_mode: "Markdown", reply_markup: { inline_keyboard: kb } }));
}

function sendSupportMenu(chatId) {
  const caption = "🤝 *Nous soutenir*\n\nChoisis une option 👇";

  const kb = [
    [{ text: "📲 Nous suivre", callback_data: "support_follow" }],
    [{ text: "🎮 Jouer (Gamee)", url: GAMEE_PLAY_URL }], // ✅ ouvre direct
    [{ text: "💸 Don", callback_data: "support_donate" }],
    [{ text: "🤝 Partenaire du moment", callback_data: "support_partner" }],
    [{ text: "⬅️ Retour", callback_data: "menu_start" }],
  ];

  return bot
    .sendPhoto(chatId, SUPPORT_IMAGE_URL, {
      caption,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: kb },
    })
    .catch(() => bot.sendMessage(chatId, caption, { parse_mode: "Markdown", reply_markup: { inline_keyboard: kb } }));
}

function sendAdminMenu(chatId, userId) {
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  const kb = [
    [{ text: "📜 Voir commandes Admin", callback_data: "admin_help" }],
    [{ text: "📊 Statistiques (/stat)", callback_data: "admin_stat" }],
    [{ text: "⬅️ Retour", callback_data: "menu_start" }],
  ];

  return bot
    .sendPhoto(chatId, ADMIN_IMAGE_URL, {
      caption: "🧰 *Admin — HarvestDex*\n\nGestion des fiches + stats.",
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: kb },
    })
    .catch(() =>
      bot.sendMessage(chatId, "🧰 *Admin — HarvestDex*\n\nGestion des fiches + stats.", {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: kb },
      })
    );
}

/* =========================
   /start
   ========================= */
bot.onText(/^\/start(?:\s|$)/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  sendStartMenu(chatId, userId);
});

/* =========================
   Commandes admin (texte)
   ========================= */
bot.onText(/^\/myid$/, (msg) => {
  bot.sendMessage(msg.chat.id, `✅ user_id = ${msg.from?.id}\n✅ chat_id = ${msg.chat.id}`);
});

bot.onText(/^\/adminhelp$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  const txt =
    "👑 *Commandes Admin — HarvestDex*\n\n" +
    "✅ /dbtest *(test Supabase)*\n" +
    "✅ /stat *(stats)*\n" +
    "✅ /list [hash|weed|extraction|wpff|120u|90u|73u|45u|indica|sativa|hybrid]\n" +
    "✅ /addform *(ajout guidé)*\n" +
    "✅ /editform *(modif guidée)*\n" +
    "✅ /delform *(suppression guidée)*\n" +
    "✅ /edit id field value\n" +
    "✅ /del id\n\n" +
    "✨ *Légendaire du moment*\n" +
    "✅ /rare id (titre optionnel)\n" +
    "✅ /unrare\n" +
    "✅ /rareinfo\n\n" +
    "*fields /edit:* name,type,subcategory_id,micron,weed_kind,thc,description,img,advice,terpenes,aroma,effects,season";

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

    const { count: cardsCount, error: e1 } = await sb.from("cards").select("*", { count: "exact", head: true });
    if (e1) throw e1;

    const { count: favCount, error: e2 } = await sb.from("favorites").select("*", { count: "exact", head: true });
    if (e2) throw e2;

    const { count: subCount, error: e3 } = await sb.from("subcategories").select("*", { count: "exact", head: true });
    if (e3) throw e3;

    const seasonId = await dbGetActiveSeasonId();
    const featured = await dbGetFeatured();

    bot.sendMessage(
      chatId,
      "📊 *Stats — HarvestDex*\n\n" +
        `• Saison active: *${seasonId || "—"}*\n` +
        `• Sous-catégories: *${subCount ?? 0}*\n` +
        `• Fiches: *${cardsCount ?? 0}*\n` +
        `• Favoris: *${favCount ?? 0}*\n` +
        `• Légendaire du moment: *${featured ? "#" + featured.id + " " + featured.name : "Aucune"}*\n`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    bot.sendMessage(chatId, `❌ /stat: ${e.message}`);
  }
});

/* =========================
   Rare / Legendary commands
   ========================= */
bot.onText(/^\/rare\s+(\d+)(?:\s+([\s\S]+))?$/m, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const id = Number(match[1]);
    const title = (match[2] || "").trim();

    const card = await dbGetCard(id);
    if (!card) return bot.sendMessage(chatId, "❌ ID introuvable.");

    const updated = await dbSetFeatured(id, title || "✨ Légendaire du moment");

    const extra =
      updated.type === "weed" ? (updated.weed_kind ? ` • ${updated.weed_kind}` : "") : updated.micron ? ` • ${updated.micron}` : "";

    bot.sendMessage(
      chatId,
      `✨ *Légendaire du moment activé !*\n\n#${updated.id} — *${updated.name}*\n${typeLabel(updated.type)}${extra}\nTitre: *${updated.featured_title || "✨ Légendaire du moment"}*`,
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
    bot.sendMessage(chatId, "✅ Légendaire du moment désactivé.");
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
    if (!c) return bot.sendMessage(chatId, "Aucune Légendaire du moment actuellement.");

    const extra =
      c.type === "weed" ? (c.weed_kind ? ` • ${c.weed_kind}` : "") : c.micron ? ` • ${c.micron}` : "";

    bot.sendMessage(
      chatId,
      `✨ Légendaire actuelle:\n#${c.id} — ${c.name}\n${typeLabel(c.type)}${extra}\nTitre: ${c.featured_title || "✨ Légendaire du moment"}`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    bot.sendMessage(chatId, `❌ /rareinfo: ${e.message}`);
  }
});

/* =========================
   list / edit / del (rapides)
   ========================= */
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
          t === "weed" ? (c.weed_kind ? ` • ${c.weed_kind}` : "") : c.micron ? ` • ${c.micron}` : "";
        const sub = c.subcategories?.label ? ` • ${c.subcategories.label}` : "";
        return `#${c.id} • ${t}${extra}${sub} • ${c.name}`;
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
      "name",
      "type",
      "subcategory_id",
      "micron",
      "weed_kind",
      "thc",
      "description",
      "img",
      "advice",
      "terpenes",
      "aroma",
      "effects",
      "season",
    ]);
    if (!allowedFields.has(field)) return bot.sendMessage(chatId, "❌ Champ invalide.");

    const card = await dbGetCard(id);
    if (!card) return bot.sendMessage(chatId, "❌ ID introuvable.");

    const patch = {};

    if (field === "type") {
      const newType = value.toLowerCase();
      if (!allowedTypes.has(newType)) return bot.sendMessage(chatId, "❌ type invalide: hash|weed|extraction|wpff");
      patch.type = newType;

      // reset champs dépendants
      patch.subcategory_id = null;
      if (newType === "weed") {
        patch.micron = null;
        patch.weed_kind = card.weed_kind || "hybrid";
      } else {
        patch.weed_kind = null;
      }
    } else if (field === "subcategory_id") {
      const v = value === "-" ? null : Number(value);
      if (v && !Number.isFinite(v)) return bot.sendMessage(chatId, "❌ subcategory_id invalide (nombre).");

      // optionnel: vérifier existence
      if (v) {
        const { data: sc, error } = await sb.from("subcategories").select("id,type").eq("id", v).maybeSingle();
        if (error) throw error;
        if (!sc) return bot.sendMessage(chatId, "❌ subcategory_id introuvable.");
        if (String(sc.type).toLowerCase() !== String(card.type).toLowerCase()) {
          return bot.sendMessage(chatId, `❌ Cette sous-catégorie est pour "${sc.type}", pas pour "${card.type}".`);
        }
      }

      patch.subcategory_id = v;
    } else if (field === "micron") {
      const v = value === "-" ? null : value.toLowerCase();
      if (v && !isMicron(v)) return bot.sendMessage(chatId, "❌ micron invalide: 120u|90u|73u|45u (ou `-`)");
      if (String(card.type).toLowerCase() === "weed") return bot.sendMessage(chatId, "❌ Weed n'a pas de micron.");
      patch.micron = v;
    } else if (field === "weed_kind") {
      const v = value === "-" ? null : value.toLowerCase();
      if (v && !isWeedKind(v)) return bot.sendMessage(chatId, "❌ weed_kind invalide: indica|sativa|hybrid (ou `-`)");
      if (String(card.type).toLowerCase() !== "weed") return bot.sendMessage(chatId, "❌ weed_kind existe seulement pour weed.");
      patch.weed_kind = v || "hybrid";
    } else if (["terpenes", "aroma", "effects"].includes(field)) {
      patch[field] = value === "-" ? [] : csvToArr(value);
    } else {
      patch[field] = value === "-" ? "" : value;
    }

    await dbUpdateCard(id, patch);
    bot.sendMessage(chatId, `✅ Modifié #${id} → ${field} mis à jour.`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /edit: ${e.message}`);
  }
});

/* =========================
   Wizards (add/edit/del form)
   ========================= */
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
  bot.sendMessage(chatId, "2/11 — Choisis la *catégorie* :", {
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

async function askSubcategory(chatId, type) {
  try {
    const subs = await dbListSubcategories(type);
    if (!subs.length) {
      return bot.sendMessage(
        chatId,
        `⚠️ Aucune sous-catégorie active en base pour "${type}".\nAjoute-en dans la table subcategories.`,
        { reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "add_cancel" }]] } }
      );
    }

    // Telegram limite: on évite un clavier trop énorme
    const buttons = subs.slice(0, 30).map((s) => [{ text: s.label, callback_data: `add_sub_${s.id}` }]);
    buttons.push([{ text: "Aucune", callback_data: "add_sub_none" }]);
    buttons.push([{ text: "❌ Annuler", callback_data: "add_cancel" }]);

    bot.sendMessage(chatId, "3/11 — Choisis la *sous-catégorie* :", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (e) {
    bot.sendMessage(chatId, `❌ Sous-catégories: ${e.message}`);
  }
}

function askMicron(chatId) {
  bot.sendMessage(chatId, "4/11 — Choisis le *micron* :", {
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
  bot.sendMessage(chatId, "4/11 — Choisis *indica / sativa / hybrid* :", {
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
  const seasonId = await dbGetActiveSeasonId();

  const payload = {
    name: d.name,
    type: t,
    season: seasonId,
    subcategory_id: d.subcategory_id || null,
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
    (payload.subcategory_id ? `Sous-catégorie ID: *${payload.subcategory_id}*\n` : "") +
    (payload.season ? `Saison: *${payload.season}*\n` : "") +
    `\n${card.thc}\n\n` +
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
    "📝 *Ajout d'une fiche* (formulaire)\n\n1/11 — Envoie le *nom*.\nEx: `Static Hash Premium`",
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

    const buttons = cards
      .slice(0, 30)
      .map((c) => [{ text: `#${c.id} ${c.name}`, callback_data: `edit_pick_${c.id}` }]);
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

    const buttons = cards
      .slice(0, 30)
      .map((c) => [{ text: `🗑️ #${c.id} ${c.name}`, callback_data: `del_pick_${c.id}` }]);
    buttons.push([{ text: "❌ Annuler", callback_data: "del_cancel" }]);

    bot.sendMessage(chatId, "🗑️ Choisis la fiche à supprimer :", { reply_markup: { inline_keyboard: buttons } });
  } catch (e) {
    bot.sendMessage(chatId, `❌ /delform: ${e.message}`);
  }
});

/* =========================
   SINGLE callback_query handler
   ========================= */
bot.on("callback_query", async (query) => {
  const chatId = query?.message?.chat?.id;
  const userId = query?.from?.id;
  const data = query?.data || "";
  if (!chatId) return;

  try {
    await bot.answerCallbackQuery(query.id);
  } catch {}

  // Menus
  if (data === "menu_start") return sendStartMenu(chatId, userId);
  if (data === "menu_info") return sendInfoMenu(chatId);
  if (data === "menu_support") return sendSupportMenu(chatId);
  if (data === "menu_admin") return sendAdminMenu(chatId, userId);

  if (data === "support_follow") {
    return bot.sendMessage(
      chatId,
      "📲 *Nous suivre*\n\n• Instagram : (à ajouter)\n• TikTok : (à ajouter)\n• Telegram : (à ajouter)",
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] } }
    );
  }

  if (data === "support_donate") {
    return bot.sendMessage(
      chatId,
      "💸 *Don*\n\nBientôt : lien TWINT / crypto.\nEnvoie-moi ton lien et je le mets.",
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] } }
    );
  }

  if (data === "support_partner") {
    const lines = [
      `🤝 *${PARTNER_TITLE}*`,
      "",
      PARTNER_TEXT || "—",
      "",
      PARTNER_URL ? `🔗 ${PARTNER_URL}` : "",
    ].filter(Boolean);

    if (PARTNER_IMAGE_URL) {
      return bot
        .sendPhoto(chatId, PARTNER_IMAGE_URL, {
          caption: lines.join("\n"),
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] },
        })
        .catch(() =>
          bot.sendMessage(chatId, lines.join("\n"), {
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] },
          })
        );
    }

    return bot.sendMessage(chatId, lines.join("\n"), {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] },
    });
  }

  // Admin menu buttons
  if (data === "admin_help") {
    if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");
    return bot.sendMessage(chatId, "📜 Utilise la commande : /adminhelp");
  }
  if (data === "admin_stat") {
    if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");
    return bot.sendMessage(chatId, "📊 Utilise la commande : /stat");
  }

  // Wizards
  if (isAdminUser(userId) && data === "add_cancel") return addCancel(chatId);
  if (isAdminUser(userId) && data === "edit_cancel") return editCancel(chatId);
  if (isAdminUser(userId) && data === "del_cancel") return delCancel(chatId);

  if (isAdminUser(userId) && data.startsWith("add_type_")) {
    const state = addWizard.get(chatId);
    if (!state) return;

    const t = data.replace("add_type_", "");
    if (!allowedTypes.has(t)) return;

    state.data.type = t;
    state.step = "subcategory";
    addWizard.set(chatId, state);
    return askSubcategory(chatId, t);
  }

  if (isAdminUser(userId) && data === "add_sub_none") {
    const state = addWizard.get(chatId);
    if (!state) return;

    state.data.subcategory_id = null;

    const t = String(state.data.type || "").toLowerCase();
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

  if (isAdminUser(userId) && data.startsWith("add_sub_")) {
    const state = addWizard.get(chatId);
    if (!state) return;

    const subId = Number(data.replace("add_sub_", ""));
    if (!Number.isFinite(subId)) return;

    // sécurité: vérifie le type
    try {
      const { data: sc, error } = await sb.from("subcategories").select("id,type").eq("id", subId).maybeSingle();
      if (error) throw error;
      if (!sc) return bot.sendMessage(chatId, "❌ Sous-catégorie introuvable.");
      if (String(sc.type).toLowerCase() !== String(state.data.type).toLowerCase()) {
        return bot.sendMessage(chatId, "❌ Sous-catégorie pas compatible avec ce type.");
      }
    } catch (e) {
      return bot.sendMessage(chatId, `❌ Sous-catégorie: ${e.message}`);
    }

    state.data.subcategory_id = subId;

    const t = String(state.data.type || "").toLowerCase();
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

    return bot.sendMessage(chatId, "5/11 — Envoie le *THC* (ex: `THC: 20–26%`).", {
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

    return bot.sendMessage(chatId, "5/11 — Envoie le *THC* (ex: `THC: 35–55%`).", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "add_cancel" }]] },
    });
  }

  if (isAdminUser(userId) && data.startsWith("del_pick_")) {
    try {
      const id = Number(data.replace("del_pick_", ""));
      const card = await dbGetCard(id);
      if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");

      delWizard.set(chatId, { id });

      const extra =
        card.type === "weed" ? (card.weed_kind ? ` • ${card.weed_kind}` : "") : card.micron ? ` • ${card.micron}` : "";

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
            [{ text: "Sous-catégorie (ID)", callback_data: `edit_field_${id}_subcategory_id` }, { text: "Saison", callback_data: `edit_field_${id}_season` }],
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
});

/* =========================
   Text steps (ADD + EDIT value)
   ========================= */
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
      return bot.sendMessage(chatId, "6/11 — Envoie la *description*.", { parse_mode: "Markdown" });
    }

    if (addState.step === "description") {
      addState.data.description = text;
      addState.step = "terpenes";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "7/11 — Terpènes (virgules) ou `-`", { parse_mode: "Markdown" });
    }

    if (addState.step === "terpenes") {
      addState.data.terpenes = text === "-" ? "" : text;
      addState.step = "aroma";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "8/11 — Arômes (virgules) ou `-`", { parse_mode: "Markdown" });
    }

    if (addState.step === "aroma") {
      addState.data.aroma = text === "-" ? "" : text;
      addState.step = "effects";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "9/11 — Effets (virgules) ou `-`", { parse_mode: "Markdown" });
    }

    if (addState.step === "effects") {
      addState.data.effects = text === "-" ? "" : text;
      addState.step = "advice";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "10/11 — Conseils / warning", { parse_mode: "Markdown" });
    }

    if (addState.step === "advice") {
      addState.data.advice = text;
      addState.step = "img";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "11/11 — Image URL (ou `-`)", { parse_mode: "Markdown" });
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
      const valRaw = text === "-" ? "" : text;

      const card = await dbGetCard(id);
      if (!card) throw new Error("Fiche introuvable.");

      const patch = {};

      if (["terpenes", "aroma", "effects"].includes(field)) {
        patch[field] = valRaw ? csvToArr(valRaw) : [];
      } else if (field === "micron") {
        if (String(card.type).toLowerCase() === "weed") throw new Error("Weed n'a pas de micron.");
        if (valRaw && !isMicron(valRaw)) throw new Error("micron invalide");
        patch.micron = valRaw ? valRaw.toLowerCase() : null;
      } else if (field === "weed_kind") {
        if (String(card.type).toLowerCase() !== "weed") throw new Error("weed_kind uniquement pour weed.");
        if (valRaw && !isWeedKind(valRaw)) throw new Error("weed_kind invalide");
        patch.weed_kind = valRaw ? valRaw.toLowerCase() : "hybrid";
        patch.micron = null;
      } else if (field === "type") {
        const v = valRaw.toLowerCase();
        if (v && !allowedTypes.has(v)) throw new Error("type invalide");
        patch.type = v;
        patch.subcategory_id = null;

        if (v === "weed") {
          patch.micron = null;
          patch.weed_kind = card.weed_kind || "hybrid";
        } else {
          patch.weed_kind = null;
        }
      } else if (field === "subcategory_id") {
        const v = valRaw ? Number(valRaw) : null;
        if (v && !Number.isFinite(v)) throw new Error("subcategory_id invalide (nombre).");

        if (v) {
          const { data: sc, error } = await sb.from("subcategories").select("id,type").eq("id", v).maybeSingle();
          if (error) throw error;
          if (!sc) throw new Error("subcategory_id introuvable.");
          if (String(sc.type).toLowerCase() !== String(card.type).toLowerCase()) {
            throw new Error(`Sous-catégorie pour "${sc.type}", pas pour "${card.type}".`);
          }
        }
        patch.subcategory_id = v;
      } else {
        patch[field] = valRaw;
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

/* =========================
   Start server last
   ========================= */
app.listen(PORT, () => console.log("Serveur HarvestDex lancé sur le port", PORT));
