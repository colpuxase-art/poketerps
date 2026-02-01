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
const TOKEN = (process.env.BOT_TOKEN || "").trim();
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE = (process.env.SUPABASE_SERVICE_ROLE || "").trim();
const WEBAPP_URL = (process.env.WEBAPP_URL || "").trim(); // ex: https://poketerps.onrender.com

// Optionnel: si tu veux webhook, mets WEBHOOK_URL = https://poketerps.onrender.com
// Sinon laisse vide => polling (mais on deleteWebhook pour éviter le 409)
const WEBHOOK_URL = (process.env.WEBHOOK_URL || "").trim();

const START_IMAGE_URL =
  process.env.START_IMAGE_URL || "https://i.postimg.cc/9Qp0JmJY/harvestdex-start.jpg";
const INFO_IMAGE_URL =
  process.env.INFO_IMAGE_URL || "https://i.postimg.cc/3w3qj7tK/harvestdex-info.jpg";
const SUPPORT_IMAGE_URL =
  process.env.SUPPORT_IMAGE_URL || "https://i.postimg.cc/8C6r8V5p/harvestdex-support.jpg";

if (!TOKEN) {
  console.error("❌ BOT_TOKEN manquant.");
  process.exit(1);
}

const supabaseReady = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE);
const sb = supabaseReady
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } })
  : null;

function assertSupabase() {
  if (!sb) throw new Error("Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE manquants).");
}

// =========================
// Admin
// =========================
const ADMIN_IDS = new Set([6675436692]); // ✅ TON USER ID
const isAdminUser = (userId) => ADMIN_IDS.has(Number(userId));

// =========================
// Helpers
// =========================
const safeStr = (v) => (v == null ? "" : String(v));
const norm = (v) => safeStr(v).trim().toLowerCase();

const allowedTypes = new Set(["hash", "weed", "extraction", "wpff"]);
const micronValues = ["120u", "90u", "73u", "45u"];
const weedKindValues = ["indica", "sativa", "hybrid"];
const isMicron = (v) => micronValues.includes(norm(v));
const isWeedKind = (v) => weedKindValues.includes(norm(v));

const csvToArr = (str) =>
  safeStr(str)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const typeLabel = (t) => ({ hash: "Hash", weed: "Weed", extraction: "Extraction", wpff: "WPFF" }[t] || t);
const weedKindLabel = (k) => ({ indica: "Indica", sativa: "Sativa", hybrid: "Hybrid" }[k] || k);

// Telegram safe send (NO Markdown -> no entity parse errors)
async function safeSendMessage(chatId, text, opts = {}) {
  try {
    return await bot.sendMessage(chatId, safeStr(text), opts);
  } catch (e) {
    console.warn("safeSendMessage fail:", e?.message || e);
  }
}

async function safeSendPhoto(chatId, url, caption, extra = {}) {
  try {
    return await bot.sendPhoto(chatId, url, { caption: safeStr(caption), ...extra });
  } catch {
    return safeSendMessage(chatId, caption, extra);
  }
}

// =========================
// DB: cards/subcategories/farms (JOIN)
// =========================
function mapCardRow(c) {
  if (!c) return null;

  const subObj = c.subcategory || c.subcategories || null;
  const farmObj = c.farm || c.farms || null;

  return {
    ...c,
    // compat front
    desc: c.description ?? "—",
    subcategory_id: c.subcategory_id ?? null,
    subcategory:
      typeof subObj === "object" && subObj
        ? (subObj.label ?? subObj.name ?? null)
        : (c.subcategory ?? c.sub_category ?? null),
    subcategory_type:
      typeof subObj === "object" && subObj
        ? (subObj.type ?? null)
        : (c.subcategory_type ?? null),
    farm_id: c.farm_id ?? (farmObj && farmObj.id != null ? farmObj.id : null),
    farm:
      typeof farmObj === "object" && farmObj
        ? farmObj
        : (c.farm ?? null),
  };
}

async function dbListCards() {
  assertSupabase();
  // JOIN subcategories + farms (FK must exist in Supabase)
  const { data, error } = await sb
    .from("cards")
    .select("*, subcategory:subcategories(id,label,type,sort), farm:farms(id,name,country,instagram,website)")
    .order("id", { ascending: true });

  if (error) throw error;
  return (data || []).map(mapCardRow).filter(Boolean);
}

async function dbGetCard(id) {
  assertSupabase();
  const { data, error } = await sb
    .from("cards")
    .select("*, subcategory:subcategories(id,label,type,sort), farm:farms(id,name,country,instagram,website)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return mapCardRow(data);
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

async function dbListSubcategories() {
  assertSupabase();
  const { data, error } = await sb.from("subcategories").select("*").eq("is_active", true).order("sort", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function dbListFarms() {
  assertSupabase();
  const { data, error } = await sb.from("farms").select("*").eq("is_active", true).order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

// =========================
// Featured + Partner
// =========================
async function dbGetFeatured() {
  assertSupabase();
  const { data, error } = await sb
    .from("cards")
    .select("*, subcategory:subcategories(id,label,type,sort), farm:farms(id,name,country,instagram,website)")
    .eq("is_featured", true)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return mapCardRow(data);
}

async function dbSetFeatured(id, title) {
  assertSupabase();
  // unset others
  const { error: e1 } = await sb.from("cards").update({ is_featured: false, featured_title: null }).eq("is_featured", true);
  if (e1) throw e1;
  // set this
  const patch = { is_featured: true, featured_title: title || "✨ Shiny du moment" };
  const { data, error: e2 } = await sb.from("cards").update(patch).eq("id", id).select("*").single();
  if (e2) throw e2;
  return data;
}

async function dbUnsetFeatured() {
  assertSupabase();
  const { error } = await sb.from("cards").update({ is_featured: false, featured_title: null }).eq("is_featured", true);
  if (error) throw error;
}

async function dbGetPartner() {
  assertSupabase();
  const { data, error } = await sb
    .from("cards")
    .select("*, subcategory:subcategories(id,label,type,sort), farm:farms(id,name,country,instagram,website)")
    .eq("is_partner", true)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return mapCardRow(data);
}

async function dbSetPartner(id, title) {
  assertSupabase();
  const { error: e1 } = await sb.from("cards").update({ is_partner: false, partner_title: null }).eq("is_partner", true);
  if (e1) throw e1;

  const patch = { is_partner: true, partner_title: title || "🤝 Partenaire du moment" };
  const { data, error: e2 } = await sb.from("cards").update(patch).eq("id", id).select("*").single();
  if (e2) throw e2;

  return data;
}

async function dbUnsetPartner() {
  assertSupabase();
  const { error } = await sb.from("cards").update({ is_partner: false, partner_title: null }).eq("is_partner", true);
  if (error) throw error;
}

// =========================
// Stats: popular / trending / new
// =========================
async function columnExists(table, col) {
  assertSupabase();
  const { error } = await sb.from(table).select(col, { head: true }).limit(1);
  return !error;
}

async function getFavoriteCounts({ days = null } = {}) {
  assertSupabase();
  const useWindow = Number(days || 0) > 0;
  const hasCreatedAt = useWindow ? await columnExists("favorites", "created_at") : false;
  const sinceISO = useWindow ? new Date(Date.now() - days * 864e5).toISOString() : null;

  let q = sb.from("favorites").select("card_id" + (hasCreatedAt ? ",created_at" : ""));
  if (hasCreatedAt && sinceISO) q = q.gte("created_at", sinceISO);
  const { data, error } = await q;
  if (error) throw error;

  const counts = new Map();
  for (const r of data || []) {
    if (r.card_id == null) continue;
    const k = String(r.card_id);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

async function getViewCounts({ days = 7 } = {}) {
  // optional: track_events may not exist
  if (!sb) return new Map();
  try {
    const exists = await columnExists("track_events", "created_at");
    const hasCardId = await columnExists("track_events", "card_id");
    if (!hasCardId) return new Map();

    const sinceISO = exists ? new Date(Date.now() - days * 864e5).toISOString() : null;
    let q = sb.from("track_events").select("card_id" + (exists ? ",created_at" : ""));
    if (exists && sinceISO) q = q.gte("created_at", sinceISO);

    const { data, error } = await q;
    if (error) return new Map();

    const counts = new Map();
    for (const r of data || []) {
      if (r.card_id == null) continue;
      const k = String(r.card_id);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return counts;
  } catch {
    return new Map();
  }
}

async function listPopular({ limit = 8 } = {}) {
  const [cards, favCounts] = await Promise.all([dbListCards(), getFavoriteCounts()]);
  const enriched = cards.map((c) => ({
    ...c,
    favorite_count: favCounts.get(String(c.id)) || 0,
  }));
  enriched.sort((a, b) => (b.favorite_count - a.favorite_count) || (Number(b.id) - Number(a.id)));
  return enriched.slice(0, Math.min(50, Math.max(1, limit)));
}

async function listTrending({ limit = 8 } = {}) {
  const [cards, fav7, views7] = await Promise.all([
    dbListCards(),
    getFavoriteCounts({ days: 7 }),
    getViewCounts({ days: 7 }),
  ]);

  // score mix: fav*3 + views
  const enriched = cards.map((c) => {
    const fav = fav7.get(String(c.id)) || 0;
    const view = views7.get(String(c.id)) || 0;
    return { ...c, trending_fav_7d: fav, trending_views_7d: view, score: fav * 3 + view };
  });

  enriched.sort((a, b) => (b.score - a.score) || (Number(b.id) - Number(a.id)));
  return enriched.slice(0, Math.min(50, Math.max(1, limit)));
}

async function listNew({ limit = 8 } = {}) {
  assertSupabase();
  const hasCreatedAt = await columnExists("cards", "created_at");

  let q = sb
    .from("cards")
    .select("*, subcategory:subcategories(id,label,type,sort), farm:farms(id,name,country,instagram,website)");

  if (hasCreatedAt) q = q.order("created_at", { ascending: false });
  else q = q.order("id", { ascending: false });

  const { data, error } = await q.limit(Math.min(50, Math.max(1, limit)));
  if (error) throw error;
  return (data || []).map(mapCardRow).filter(Boolean);
}

// =========================
// API
// =========================
app.get("/api/config", (req, res) => {
  res.json({
    admin_ids: [...ADMIN_IDS],
    webapp_url: WEBAPP_URL,
  });
});

app.get("/api/cards", async (req, res) => {
  try {
    const cards = await dbListCards();
    res.json(cards);
  } catch (e) {
    console.error("❌ /api/cards:", e.message);
    res.status(500).json({ error: "db_error", message: e.message });
  }
});

app.get("/api/subcategories", async (req, res) => {
  try {
    const subs = await dbListSubcategories();
    res.json(subs);
  } catch (e) {
    // fallback: minimal
    res.json([
      { id: 0, type: "hash", label: "Dry Sift", sort: 10 },
      { id: 0, type: "hash", label: "Static Sift", sort: 15 },
      { id: 0, type: "hash", label: "Bubble Hash", sort: 20 },
      { id: 0, type: "hash", label: "Full Melt", sort: 30 },
      { id: 0, type: "extraction", label: "Rosin", sort: 10 },
    ]);
  }
});

app.get("/api/farms", async (req, res) => {
  try {
    const farms = await dbListFarms();
    res.json(farms);
  } catch (e) {
    res.json([]);
  }
});

app.get("/api/featured", async (req, res) => {
  try {
    const c = await dbGetFeatured();
    res.json(c || null);
  } catch (e) {
    res.status(500).json({ error: "db_error", message: e.message });
  }
});

app.get("/api/partner", async (req, res) => {
  try {
    const c = await dbGetPartner();
    res.json(c || null);
  } catch (e) {
    res.status(500).json({ error: "db_error", message: e.message });
  }
});

app.get("/api/stats/popular", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 8), 50);
    res.json(await listPopular({ limit }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/stats/trending", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 8), 50);
    res.json(await listTrending({ limit }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/stats/new", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 8), 50);
    res.json(await listNew({ limit }));
  } catch (e) {
    res.status(500).json({ error: e.message });
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

    const ids = (favs || []).map((f) => f.card_id).filter((x) => x != null);
    if (!ids.length) return res.json([]);

    const { data, error: e2 } = await sb
      .from("cards")
      .select("*, subcategory:subcategories(id,label,type,sort), farm:farms(id,name,country,instagram,website)")
      .in("id", ids)
      .order("id", { ascending: false });

    if (e2) throw e2;
    res.json((data || []).map(mapCardRow).filter(Boolean));
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
  // IMPORTANT: évite le 409 si un webhook a été laissé actif
  bot.deleteWebHook({ drop_pending_updates: true }).catch(() => {});
  console.log("✅ Bot en mode POLLING");
}

bot.on("polling_error", (e) => {
  console.error("❌ polling_error :", e?.message || e);
});

// =========================
// /start menu
// =========================
function buildStartKeyboard(userId) {
  const admin = isAdminUser(userId);

  const webUrl = WEBAPP_URL || WEBHOOK_URL || ""; // pour éviter webapp vide
  const keyboard = [
    [{ text: "📘 Ouvrir le Dex", web_app: { url: webUrl } }],
    [
      { text: "⭐ Mon Dex", web_app: { url: webUrl + "#mydex" } },
      { text: "👤 Profil", web_app: { url: webUrl + "#profile" } },
    ],
    [{ text: "ℹ️ Informations", callback_data: "menu_info" }],
    [{ text: "🤝 Nous soutenir", callback_data: "menu_support" }],
  ];

  if (admin) keyboard.push([{ text: "🧰 Admin", callback_data: "menu_admin" }]);
  return keyboard;
}

async function sendStartMenu(chatId, userId) {
  const caption =
    "🧬 PokéTerps / HarvestDex\n\n" +
    "Collectionne tes fiches, ajoute-les à Mon Dex et explore les catégories 🔥";

  const keyboard = buildStartKeyboard(userId);
  return safeSendPhoto(chatId, START_IMAGE_URL, caption, {
    reply_markup: { inline_keyboard: keyboard },
  });
}

bot.onText(/^\/start$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  sendStartMenu(chatId, userId);
});

// =========================
// ADMIN HELP
// =========================
bot.onText(/^\/myid$/, (msg) => {
  safeSendMessage(msg.chat.id, `✅ user_id = ${msg.from?.id}\n✅ chat_id = ${msg.chat.id}`);
});

bot.onText(/^\/adminhelp$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");

  const txt =
    "👑 Commandes Admin\n\n" +
    "Ajout / édition\n" +
    "• /addform — ajouter une fiche (guidé)\n" +
    "• /editform — modifier via menus\n" +
    "• /delform — supprimer via menus\n" +
    "• /edit <id> <champ> <valeur> — édition rapide\n" +
    "• /del <id> — suppression rapide\n" +
    "• /list (option: weed|hash|extraction|wpff|120u|90u|73u|45u|indica|sativa|hybrid)\n\n" +
    "Rare / Shiny\n" +
    "• /rare <id> (titre optionnel)\n" +
    "• /unrare\n" +
    "• /rareinfo\n\n" +
    "Partenaire\n" +
    "• /partner <id> (titre optionnel)\n" +
    "• /unpartner\n" +
    "• /partnerinfo\n\n" +
    "Debug\n" +
    "• /dbtest\n" +
    "• /stat\n" +
    "• /myid\n\n" +
    "Fields /edit:\n" +
    "name,type,micron,weed_kind,thc,description,img,advice,terpenes,aroma,effects,subcategory_id,farm_id,season";

  safeSendMessage(chatId, txt);
});

bot.onText(/^\/dbtest$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return;

  try {
    assertSupabase();
    const { error } = await sb.from("cards").select("id").limit(1);
    if (error) throw error;
    safeSendMessage(chatId, "✅ Supabase OK (table cards accessible)");
  } catch (e) {
    safeSendMessage(chatId, `❌ Supabase KO: ${e.message}`);
  }
});

bot.onText(/^\/stat$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");

  try {
    assertSupabase();
    // track_events optionnel
    let eventsCount = 0;
    try {
      const { count } = await sb.from("track_events").select("*", { count: "exact", head: true });
      eventsCount = count || 0;
    } catch {}

    const popular = await listPopular({ limit: 5 });
    const lines = popular.map((c, i) => `${i + 1}. #${c.id} ${c.name} (❤️ ${c.favorite_count || 0})`).join("\n");

    safeSendMessage(
      chatId,
      "📊 Stats\n\n" +
        `Events (track_events): ${eventsCount}\n\n` +
        "Top Populaire:\n" +
        (lines || "—")
    );
  } catch (e) {
    safeSendMessage(chatId, `❌ /stat: ${e.message}`);
  }
});

// =========================
// Rare + Partner commands
// =========================
bot.onText(/^\/rare\s+(\d+)(?:\s+([\s\S]+))?$/m, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const id = Number(match[1]);
    const title = (match[2] || "").trim();

    const card = await dbGetCard(id);
    if (!card) return safeSendMessage(chatId, "❌ ID introuvable.");

    const updated = await dbSetFeatured(id, title || "✨ Shiny du moment");
    safeSendMessage(chatId, `✨ Rare du moment activée: #${updated.id} — ${updated.name}`);
  } catch (e) {
    safeSendMessage(chatId, `❌ /rare: ${e.message}`);
  }
});

bot.onText(/^\/unrare$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");
  try {
    await dbUnsetFeatured();
    safeSendMessage(chatId, "✅ Rare du moment désactivée.");
  } catch (e) {
    safeSendMessage(chatId, `❌ /unrare: ${e.message}`);
  }
});

bot.onText(/^\/rareinfo$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");
  try {
    const c = await dbGetFeatured();
    if (!c) return safeSendMessage(chatId, "Aucune Rare du moment actuellement.");
    safeSendMessage(chatId, `✨ Rare actuelle: #${c.id} — ${c.name} (${typeLabel(c.type)})`);
  } catch (e) {
    safeSendMessage(chatId, `❌ /rareinfo: ${e.message}`);
  }
});

bot.onText(/^\/partner\s+(\d+)(?:\s+([\s\S]+))?$/m, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const id = Number(match[1]);
    const title = (match[2] || "").trim();

    const card = await dbGetCard(id);
    if (!card) return safeSendMessage(chatId, "❌ ID introuvable.");

    const updated = await dbSetPartner(id, title || "🤝 Partenaire du moment");
    safeSendMessage(chatId, `🤝 Partenaire activé: #${updated.id} — ${updated.name}`);
  } catch (e) {
    safeSendMessage(chatId, `❌ /partner: ${e.message}`);
  }
});

bot.onText(/^\/unpartner$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");
  try {
    await dbUnsetPartner();
    safeSendMessage(chatId, "✅ Partenaire désactivé.");
  } catch (e) {
    safeSendMessage(chatId, `❌ /unpartner: ${e.message}`);
  }
});

bot.onText(/^\/partnerinfo$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");
  try {
    const c = await dbGetPartner();
    if (!c) return safeSendMessage(chatId, "Aucun partenaire actuellement.");
    safeSendMessage(chatId, `🤝 Partenaire actuel: #${c.id} — ${c.name}`);
  } catch (e) {
    safeSendMessage(chatId, `❌ /partnerinfo: ${e.message}`);
  }
});

// =========================
// list / edit / del quick commands
// =========================
bot.onText(/^\/list(?:\s+(\w+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const filter = norm(match[1] || "");
    let cards = await dbListCards();

    if (filter) {
      if (allowedTypes.has(filter)) cards = cards.filter((c) => norm(c.type) === filter);
      else if (isMicron(filter)) cards = cards.filter((c) => norm(c.micron) === filter);
      else if (isWeedKind(filter)) cards = cards.filter((c) => norm(c.weed_kind) === filter);
      else return safeSendMessage(chatId, "❌ Filtre inconnu. Ex: /list weed | /list 90u | /list indica");
    }

    if (!cards.length) return safeSendMessage(chatId, "Aucune fiche.");

    const lines = cards
      .slice(0, 80)
      .map((c) => {
        const t = norm(c.type);
        const extra = t === "weed" ? (c.weed_kind ? ` • ${c.weed_kind}` : "") : (c.micron ? ` • ${c.micron}` : "");
        return `#${c.id} • ${t}${extra} • ${c.name}`;
      })
      .join("\n");

    safeSendMessage(chatId, `📚 Fiches (${cards.length})\n\n${lines}`);
  } catch (e) {
    safeSendMessage(chatId, `❌ /list: ${e.message}`);
  }
});

bot.onText(/^\/del\s+(\d+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const id = Number(match[1]);
    const card = await dbGetCard(id);
    if (!card) return safeSendMessage(chatId, "❌ ID introuvable.");
    await dbDeleteCard(id);
    safeSendMessage(chatId, `🗑️ Supprimé: #${id}`);
  } catch (e) {
    safeSendMessage(chatId, `❌ /del: ${e.message}`);
  }
});

bot.onText(/^\/edit\s+(\d+)\s+(\w+)\s+([\s\S]+)$/m, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const id = Number(match[1]);
    const field = norm(match[2]);
    const value = (match[3] || "").trim();

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
      "subcategory_id",
      "farm_id",
      "season",
    ]);
    if (!allowedFields.has(field)) return safeSendMessage(chatId, "❌ Champ invalide.");

    const card = await dbGetCard(id);
    if (!card) return safeSendMessage(chatId, "❌ ID introuvable.");

    const patch = {};

    if (field === "type") {
      const newType = norm(value);
      if (!allowedTypes.has(newType)) return safeSendMessage(chatId, "❌ type invalide: hash|weed|extraction|wpff");
      patch.type = newType;

      if (newType === "weed") {
        patch.micron = null;
        patch.weed_kind = card.weed_kind || "hybrid";
      } else {
        patch.weed_kind = null;
      }
    } else if (field === "micron") {
      const v = value === "-" ? null : norm(value);
      if (v && !isMicron(v)) return safeSendMessage(chatId, "❌ micron invalide: 120u|90u|73u|45u (ou `-`)");
      if (norm(card.type) === "weed") return safeSendMessage(chatId, "❌ Weed n'a pas de micron.");
      patch.micron = v;
    } else if (field === "weed_kind") {
      const v = value === "-" ? null : norm(value);
      if (v && !isWeedKind(v)) return safeSendMessage(chatId, "❌ weed_kind invalide: indica|sativa|hybrid (ou `-`)");
      if (norm(card.type) !== "weed") return safeSendMessage(chatId, "❌ weed_kind seulement pour weed.");
      patch.weed_kind = v || "hybrid";
      patch.micron = null;
    } else if (["terpenes", "aroma", "effects"].includes(field)) {
      patch[field] = value === "-" ? [] : csvToArr(value);
    } else if (["subcategory_id", "farm_id"].includes(field)) {
      patch[field] = value === "-" ? null : Number(value);
      if (value !== "-" && Number.isNaN(patch[field])) return safeSendMessage(chatId, `❌ ${field} doit être un nombre (ou -).`);
    } else {
      patch[field] = value === "-" ? "" : value;
    }

    await dbUpdateCard(id, patch);
    safeSendMessage(chatId, `✅ Modifié #${id} → ${field} mis à jour.`);
  } catch (e) {
    safeSendMessage(chatId, `❌ /edit: ${e.message}`);
  }
});

// =========================
// Wizards (add/edit/del form) — ton flow conservé
// =========================
const addWizard = new Map();
const editWizard = new Map();
const delWizard = new Map();

function addCancel(chatId) {
  addWizard.delete(chatId);
  safeSendMessage(chatId, "❌ Ajout annulé.");
}
function editCancel(chatId) {
  editWizard.delete(chatId);
  safeSendMessage(chatId, "❌ Modification annulée.");
}
function delCancel(chatId) {
  delWizard.delete(chatId);
  safeSendMessage(chatId, "❌ Suppression annulée.");
}

function askType(chatId) {
  bot.sendMessage(chatId, "2/10 — Choisis la catégorie :", {
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
  bot.sendMessage(chatId, "3/10 — Choisis le micron :", {
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
  bot.sendMessage(chatId, "3/10 — Choisis indica / sativa / hybrid :", {
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

  const t = norm(d.type);
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
    subcategory_id: d.subcategory_id ?? null,
    farm_id: d.farm_id ?? null,
    season: d.season ?? null,
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
    norm(card.type) === "weed"
      ? card.weed_kind
        ? ` • ${weedKindLabel(card.weed_kind)}`
        : ""
      : card.micron
      ? ` • ${card.micron}`
      : "";

  const msg =
    `✅ Fiche ajoutée !\n\n` +
    `#${card.id} — ${card.name}\n` +
    `Catégorie: ${typeLabel(card.type)}${extra}\n` +
    `${card.thc}\n\n` +
    `🧬 ${card.description}\n` +
    `🌿 Terpènes: ${card.terpenes?.length ? card.terpenes.join(", ") : "—"}\n` +
    `👃 Arômes: ${card.aroma?.length ? card.aroma.join(", ") : "—"}\n` +
    `🧠 Effets: ${card.effects?.length ? card.effects.join(", ") : "—"}\n` +
    `⚠️ ${card.advice}`;

  safeSendMessage(chatId, msg);
}

bot.onText(/^\/addform$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");

  addWizard.set(chatId, { step: "name", data: {} });
  bot.sendMessage(chatId, "📝 Ajout d'une fiche (formulaire)\n\n1/10 — Envoie le nom.\nEx: Static Hash Premium", {
    reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "add_cancel" }]] },
  });
});

bot.onText(/^\/editform$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const cards = await dbListCards();
    if (!cards.length) return safeSendMessage(chatId, "Aucune fiche à modifier.");

    const buttons = cards.slice(0, 30).map((c) => [{ text: `#${c.id} ${c.name}`, callback_data: `edit_pick_${c.id}` }]);
    buttons.push([{ text: "❌ Annuler", callback_data: "edit_cancel" }]);

    bot.sendMessage(chatId, "🛠️ Choisis la fiche à modifier :", { reply_markup: { inline_keyboard: buttons } });
  } catch (e) {
    safeSendMessage(chatId, `❌ /editform: ${e.message}`);
  }
});

bot.onText(/^\/delform$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const cards = await dbListCards();
    if (!cards.length) return safeSendMessage(chatId, "Aucune fiche à supprimer.");

    const buttons = cards.slice(0, 30).map((c) => [{ text: `🗑️ #${c.id} ${c.name}`, callback_data: `del_pick_${c.id}` }]);
    buttons.push([{ text: "❌ Annuler", callback_data: "del_cancel" }]);

    bot.sendMessage(chatId, "🗑️ Choisis la fiche à supprimer :", { reply_markup: { inline_keyboard: buttons } });
  } catch (e) {
    safeSendMessage(chatId, `❌ /delform: ${e.message}`);
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
      "ℹ️ Informations\n\n" +
      "PokéTerps / HarvestDex est un projet éducatif.\n" +
      "Tu peux consulter les fiches, les terpènes, les arômes et les effets.\n\n" +
      "⚠️ Disclaimer\n" +
      "• Aucune vente ici.\n" +
      "• Informations uniquement.\n" +
      "• Les effets varient selon la personne.\n" +
      "• Respecte les lois de ton pays.\n";

    return safeSendPhoto(chatId, INFO_IMAGE_URL, caption, {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_back" }]] },
    });
  }

  if (data === "menu_support") {
    const caption = "🤝 Nous soutenir\n\nChoisis une option 👇";
    return safeSendPhoto(chatId, SUPPORT_IMAGE_URL, caption, {
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
    return safeSendMessage(chatId, "🤝 Nos partenaires\n\nAucun partenaire pour le moment.\nContacte-nous si tu veux apparaître ici.", {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] },
    });
  }

  if (data === "support_follow") {
    return safeSendMessage(chatId, "📲 Nous suivre : (mets tes liens ici)", {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] },
    });
  }

  if (data === "support_play") {
    return safeSendMessage(chatId, "🎮 Jouer : (mets tes jeux/liens ici)", {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] },
    });
  }

  if (data === "support_donate") {
    return safeSendMessage(chatId, "💸 Don : (mets ton lien TWINT/crypto/etc ici)", {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] },
    });
  }

  if (data === "menu_admin") {
    if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");
    return safeSendMessage(chatId, "🧰 Admin: utilise /adminhelp", {
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

    return bot.sendMessage(chatId, "4/10 — Envoie le THC (ex: THC: 20–26%).", {
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

    return bot.sendMessage(chatId, "4/10 — Envoie le THC (ex: THC: 35–55%).", {
      reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "add_cancel" }]] },
    });
  }

  if (isAdminUser(userId) && data === "edit_cancel") return editCancel(chatId);
  if (isAdminUser(userId) && data === "del_cancel") return delCancel(chatId);

  if (isAdminUser(userId) && data.startsWith("del_pick_")) {
    try {
      const id = Number(data.replace("del_pick_", ""));
      const card = await dbGetCard(id);
      if (!card) return safeSendMessage(chatId, "❌ Fiche introuvable.");

      delWizard.set(chatId, { id });

      const extra =
        norm(card.type) === "weed"
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
      return safeSendMessage(chatId, `❌ del_pick: ${e.message}`);
    }
  }

  if (isAdminUser(userId) && data.startsWith("del_confirm_")) {
    try {
      const id = Number(data.replace("del_confirm_", ""));
      const st = delWizard.get(chatId);
      if (!st || st.id !== id) return safeSendMessage(chatId, "❌ Relance /delform.");

      await dbDeleteCard(id);
      delWizard.delete(chatId);
      return safeSendMessage(chatId, `🗑️ Supprimé: #${id}`);
    } catch (e) {
      return safeSendMessage(chatId, `❌ del_confirm: ${e.message}`);
    }
  }

  if (isAdminUser(userId) && data.startsWith("edit_pick_")) {
    try {
      const id = Number(data.replace("edit_pick_", ""));
      const card = await dbGetCard(id);
      if (!card) return safeSendMessage(chatId, "❌ Fiche introuvable.");

      const isWeed = norm(card.type) === "weed";
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
            [{ text: "Subcategory ID", callback_data: `edit_field_${id}_subcategory_id` }, { text: "Farm ID", callback_data: `edit_field_${id}_farm_id` }],
            [{ text: "❌ Annuler", callback_data: "edit_cancel" }],
          ],
        },
      });
    } catch (e) {
      return safeSendMessage(chatId, `❌ edit_pick: ${e.message}`);
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
    return bot.sendMessage(chatId, `✍️ Envoie la nouvelle valeur pour ${field} (ou - pour vider).`, {
      reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "edit_cancel" }]] },
    });
  }

  if (isAdminUser(userId) && data.startsWith("edit_settype_")) {
    try {
      const parts = data.split("_");
      const id = Number(parts[2]);
      const newType = parts[3];
      if (!allowedTypes.has(newType)) return safeSendMessage(chatId, "❌ Type invalide.");

      const card = await dbGetCard(id);
      if (!card) return safeSendMessage(chatId, "❌ Fiche introuvable.");

      const patch = { type: newType };
      if (newType === "weed") {
        patch.micron = null;
        patch.weed_kind = card.weed_kind || "hybrid";
      } else {
        patch.weed_kind = null;
      }

      await dbUpdateCard(id, patch);
      return safeSendMessage(chatId, `✅ Type mis à jour: #${id} → ${newType}`);
    } catch (e) {
      return safeSendMessage(chatId, `❌ settype: ${e.message}`);
    }
  }

  if (isAdminUser(userId) && data.startsWith("edit_setmicron_")) {
    try {
      const parts = data.split("_");
      const id = Number(parts[2]);
      const micron = parts[3];
      const m = micron === "none" ? null : micron;
      if (m && !isMicron(m)) return safeSendMessage(chatId, "❌ Micron invalide.");

      const card = await dbGetCard(id);
      if (!card) return safeSendMessage(chatId, "❌ Fiche introuvable.");
      if (norm(card.type) === "weed") return safeSendMessage(chatId, "❌ Weed n'a pas de micron.");

      await dbUpdateCard(id, { micron: m });
      return safeSendMessage(chatId, `✅ Micron mis à jour: #${id} → ${m || "Aucun"}`);
    } catch (e) {
      return safeSendMessage(chatId, `❌ setmicron: ${e.message}`);
    }
  }

  if (isAdminUser(userId) && data.startsWith("edit_setweedkind_")) {
    try {
      const parts = data.split("_");
      const id = Number(parts[2]);
      const k = parts[3];
      if (!isWeedKind(k)) return safeSendMessage(chatId, "❌ weed_kind invalide.");

      const card = await dbGetCard(id);
      if (!card) return safeSendMessage(chatId, "❌ Fiche introuvable.");
      if (norm(card.type) !== "weed") return safeSendMessage(chatId, "❌ weed_kind uniquement pour weed.");

      await dbUpdateCard(id, { weed_kind: k, micron: null });
      return safeSendMessage(chatId, `✅ Weed_kind mis à jour: #${id} → ${weedKindLabel(k)}`);
    } catch (e) {
      return safeSendMessage(chatId, `❌ setweedkind: ${e.message}`);
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
      return safeSendMessage(chatId, "5/10 — Envoie la description.");
    }
    if (addState.step === "description") {
      addState.data.description = text;
      addState.step = "terpenes";
      addWizard.set(chatId, addState);
      return safeSendMessage(chatId, "6/10 — Terpènes (virgules) ou -");
    }
    if (addState.step === "terpenes") {
      addState.data.terpenes = text === "-" ? "" : text;
      addState.step = "aroma";
      addWizard.set(chatId, addState);
      return safeSendMessage(chatId, "7/10 — Arômes (virgules) ou -");
    }
    if (addState.step === "aroma") {
      addState.data.aroma = text === "-" ? "" : text;
      addState.step = "effects";
      addWizard.set(chatId, addState);
      return safeSendMessage(chatId, "8/10 — Effets (virgules) ou -");
    }
    if (addState.step === "effects") {
      addState.data.effects = text === "-" ? "" : text;
      addState.step = "advice";
      addWizard.set(chatId, addState);
      return safeSendMessage(chatId, "9/10 — Conseils / warning");
    }
    if (addState.step === "advice") {
      addState.data.advice = text;
      addState.step = "img";
      addWizard.set(chatId, addState);
      return safeSendMessage(chatId, "10/10 — Image URL (ou -)");
    }
    if (addState.step === "img") {
      addState.data.img = text === "-" ? "" : text;
      try {
        return await addFinish(chatId);
      } catch (e) {
        addWizard.delete(chatId);
        return safeSendMessage(chatId, `❌ Ajout KO: ${e.message}`);
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
        if (norm(card.type) === "weed") throw new Error("Weed n'a pas de micron.");
        if (val && !isMicron(val)) throw new Error("micron invalide");
        patch.micron = val ? norm(val) : null;
      } else if (field === "weed_kind") {
        if (norm(card.type) !== "weed") throw new Error("weed_kind uniquement pour weed.");
        if (val && !isWeedKind(val)) throw new Error("weed_kind invalide");
        patch.weed_kind = val ? norm(val) : "hybrid";
        patch.micron = null;
      } else if (field === "type") {
        const v = norm(val);
        if (v && !allowedTypes.has(v)) throw new Error("type invalide");
        patch.type = v;
        if (v === "weed") {
          patch.micron = null;
          patch.weed_kind = card.weed_kind || "hybrid";
        } else {
          patch.weed_kind = null;
        }
      } else if (["subcategory_id", "farm_id"].includes(field)) {
        patch[field] = val ? Number(val) : null;
        if (val && Number.isNaN(patch[field])) throw new Error(`${field} doit être un nombre`);
      } else {
        patch[field] = val;
      }

      await dbUpdateCard(id, patch);
      editWizard.delete(chatId);
      return safeSendMessage(chatId, `✅ Modifié #${id} → ${field} mis à jour.`);
    } catch (e) {
      editWizard.delete(chatId);
      return safeSendMessage(chatId, `❌ edit value: ${e.message}`);
    }
  }
});

// =========================
// Start server last
// =========================
app.listen(PORT, () => console.log("Serveur HarvestDex lancé sur le port", PORT));
