/* =========================================================
   HARVESTDEX — BOT + API (COMMONJS, Render-friendly)
   Patch: safer /api/cards (no relational select) + improved logs
   ========================================================= */

const express = require("express");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");

// =====================
// ENV
// =====================
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!BOT_TOKEN || !WEBAPP_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("❌ Variables d'environnement manquantes. Obligatoires : BOT_TOKEN, WEBAPP_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE");
  process.exit(1);
}

// =====================
// INIT
// =====================
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

// =====================
// ADMIN
// =====================
const ADMIN_IDS = new Set([6675436692]);
const isAdmin = (id) => ADMIN_IDS.has(Number(id));

// =====================
// HELPERS
// =====================
const typeLabel = (t) => ({ hash: "Hash", weed: "Weed", extraction: "Extraction", wpff: "WPFF" }[t] || t);

async function trackingEnabled() {
  try {
    const { data, error } = await sb.from("track_settings").select("enabled").eq("id", 1).maybeSingle();
    if (error) return false;
    return Boolean(data?.enabled);
  } catch {
    return false;
  }
}
async function track(event_type, payload = {}) {
  try {
    if (!(await trackingEnabled())) return;
    await sb.from("track_events").insert({ event_type, ...payload });
  } catch {}
}

// =====================
// DB
// =====================
async function dbListCards() {
  const { data, error } = await sb.from("cards").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function dbListSeasons() {
  const { data, error } = await sb.from("seasons").select("*").order("id", { ascending: false });
  if (error) return [];
  return data || [];
}

// =====================
// API
// =====================
app.get("/api/cards", async (req, res) => {
  try {
    const cards = await dbListCards();
    const mapped = cards.map((c) => ({ ...c, desc: c.description ?? "—" }));

    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });

    res.json(mapped);
  } catch (e) {
    console.error("❌ /api/cards:", e.message);
    res.status(500).json({ error: "api_cards_failed", message: e.message });
  }
});

app.get("/api/seasons", async (req, res) => {
  const s = await dbListSeasons();
  res.set("Cache-Control", "no-store");
  res.json(s);
});

app.get("/api/featured", async (req, res) => {
  try {
    const { data, error } = await sb
      .from("cards")
      .select("*")
      .eq("is_featured", true)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    res.set("Cache-Control", "no-store");
    res.json(data?.[0] ?? null);
  } catch (e) {
    res.status(500).json({ error: "api_featured_failed", message: e.message });
  }
});

// Favorites
app.post("/api/favorite", async (req, res) => {
  try {
    const { user_id, card_id } = req.body || {};
    if (!user_id || !card_id) return res.status(400).json({ error: "missing_user_or_card" });

    const { data: exists, error: e1 } = await sb
      .from("favorites")
      .select("id")
      .eq("user_id", user_id)
      .eq("card_id", card_id)
      .maybeSingle();
    if (e1) throw e1;

    if (exists) {
      const { error } = await sb.from("favorites").delete().eq("id", exists.id);
      if (error) throw error;
      await track("favorite_remove", { tg_user_id: user_id, card_id });
      return res.json({ favorited: false });
    }

    const { error } = await sb.from("favorites").insert({ user_id, card_id });
    if (error) throw error;
    await track("favorite_add", { tg_user_id: user_id, card_id });
    return res.json({ favorited: true });
  } catch (e) {
    console.error("❌ /api/favorite:", e.message);
    res.status(500).json({ error: "favorite_failed", message: e.message });
  }
});

app.get("/api/mydex/:uid", async (req, res) => {
  try {
    const uid = Number(req.params.uid);
    const { data, error } = await sb.from("favorites").select("cards(*)").eq("user_id", uid);
    if (error) throw error;
    res.set("Cache-Control", "no-store");
    res.json((data || []).map((x) => x.cards).filter(Boolean));
  } catch (e) {
    res.status(500).json({ error: "mydex_failed", message: e.message });
  }
});

// =====================
// BOT — /start
// =====================
bot.onText(/^\/start$/, async (msg) => {
  const chatId = msg.chat.id;
  await track("start", { tg_user_id: msg.from?.id ?? null, tg_chat_id: chatId });

  bot.sendMessage(chatId, "🌾 *HarvestDex*\n\nOuvre le Dex 👇", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[{ text: "📘 Ouvrir HarvestDex", web_app: { url: WEBAPP_URL } }]],
    },
  });
});

// quick debug for admin
bot.onText(/^\/api$/, async (msg) => {
  if (!isAdmin(msg.chat.id)) return;
  bot.sendMessage(msg.chat.id, `${WEBAPP_URL}/api/cards`);
});

// /stat minimal (admin)
bot.onText(/^\/stat$/, async (msg) => {
  if (!isAdmin(msg.chat.id)) return;
  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { count: totalCards } = await sb.from("cards").select("*", { count: "exact", head: true });
    const { data: events } = await sb.from("track_events").select("tg_user_id, event_type, created_at").gte("created_at", since);
    const totalEvents = (events || []).length;
    const uniqUsers = new Set((events || []).map((e) => e.tg_user_id).filter(Boolean)).size;

    bot.sendMessage(
      msg.chat.id,
      `📊 *Stats (7 jours)*\n\n• Fiches: *${totalCards || 0}*\n• Events: *${totalEvents}*\n• Users uniques: *${uniqUsers}*`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    bot.sendMessage(msg.chat.id, `❌ /stat error: ${e.message}`);
  }
});

// =====================
// SERVER
// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 HarvestDex running on :${PORT}`));
