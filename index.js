/* =========================================================
   HARVESTDEX — Coquette UI + Harvest features (Render-friendly)
   Features: cards API (no joins), favorites/mydex, featured, tracking,
             seasons + subcategories admin commands, /commands (admin),
             /addform wizard with season/type/subcategory/rarity/etc.
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
  console.error("❌ Missing ENV vars. Required: BOT_TOKEN, WEBAPP_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE");
  process.exit(1);
}

// Optional links
const SUPPORT_FOLLOW_URL = process.env.SUPPORT_FOLLOW_URL || "https://t.me/";
const SUPPORT_DONATE_URL = process.env.SUPPORT_DONATE_URL || "https://t.me/";
const GAME_MOTO_URL = process.env.GAME_MOTO_URL || "https://example.com/moto";
const GAME_DRIFT_URL = process.env.GAME_DRIFT_URL || "https://example.com/drift";

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
// ✅ Mets TON Telegram ID ici (msg.from.id). (déjà mis de tes logs précédents)
const ADMIN_IDS = new Set([6675436692]);
const isAdmin = (id) => ADMIN_IDS.has(Number(id));

// =====================
// HELPERS
// =====================
const typeLabel = (t) => ({ hash: "Hash", weed: "Weed", extraction: "Extraction", wpff: "WPFF" }[t] || t);
const nowIso = () => new Date().toISOString();

function uniq(arr) {
  return Array.from(new Set((arr || []).map((x) => String(x).trim()).filter(Boolean)));
}
function parseCsv(s) {
  if (!s) return [];
  return uniq(String(s).split(",").map((x) => x.trim()));
}
function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

// =====================
// TRACKING
// =====================
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
// DB HELPERS
// =====================
async function dbListCards() {
  const { data, error } = await sb.from("cards").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function dbInsertCard(card) {
  const { data, error } = await sb.from("cards").insert(card).select("*").single();
  if (error) throw error;
  return data;
}

async function dbListSeasons() {
  const { data } = await sb.from("seasons").select("*").order("id", { ascending: false });
  return data || [];
}

async function dbAddSeason(id, label) {
  const { error } = await sb.from("seasons").upsert({ id, label, is_active: false });
  if (error) throw error;
}

async function dbSetActiveSeason(id) {
  await sb.from("seasons").update({ is_active: false }).neq("id", "");
  const { error } = await sb.from("seasons").update({ is_active: true }).eq("id", id);
  if (error) throw error;
}

async function dbEnsureDefaultSeason() {
  const seasons = await dbListSeasons();
  if (seasons.length) return seasons;
  await dbAddSeason("25-26", "Harvest 25-26");
  await dbSetActiveSeason("25-26").catch(() => {});
  return dbListSeasons();
}

async function dbListSubcategories(type) {
  const { data } = await sb
    .from("subcategories")
    .select("*")
    .eq("type", type)
    .order("sort", { ascending: true });
  return data || [];
}

async function dbAddSubcategory(type, label, sort = 100, is_active = true) {
  const { error } = await sb.from("subcategories").insert({ type, label, sort, is_active });
  if (error) throw error;
}

async function dbToggleSubcategory(id) {
  const { data, error } = await sb.from("subcategories").select("id,is_active").eq("id", id).single();
  if (error) throw error;
  const { error: e2 } = await sb.from("subcategories").update({ is_active: !data.is_active }).eq("id", id);
  if (e2) throw e2;
  return !data.is_active;
}

// =====================
// API — MINI APP
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

app.get("/api/subcategories/:type", async (req, res) => {
  const type = String(req.params.type || "").toLowerCase();
  const data = await dbListSubcategories(type);
  res.set("Cache-Control", "no-store");
  res.json(data);
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

// =====================
// FAVORITES
// =====================
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
// BOT — MENUS
// =====================
function sendSupportMenu(chatId) {
  bot.sendMessage(chatId, "🤝 *Soutenir HarvestDex*", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📣 Nous suivre", url: SUPPORT_FOLLOW_URL }],
        [{ text: "🎮 Jouer", callback_data: "support_games" }],
        [{ text: "💛 Faire un don", url: SUPPORT_DONATE_URL }],
      ],
    },
  });
}
function sendGamesMenu(chatId) {
  bot.sendMessage(chatId, "🎮 *Jeux*", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🏍️ Moto", url: GAME_MOTO_URL }],
        [{ text: "🏎️ Drift", url: GAME_DRIFT_URL }],
        [{ text: "⬅️ Retour", callback_data: "support_menu" }],
      ],
    },
  });
}

function sendAdminCommands(chatId) {
  const txt =
    "🧰 *Admin Commands*\n\n" +
    "*Cartes*\n" +
    "• /addform — ajouter une fiche (wizard)\n" +
    "• /list — liste fiches\n" +
    "• /rare <id> — set shiny\n" +
    "• /unrare — remove shiny\n\n" +
    "*Saisons*\n" +
    "• /seasonlist\n" +
    "• /seasonadd <25-26> <label>\n" +
    "• /seasonactive <25-26>\n" +
    "• /seasonbulk <26 27 28>\n\n" +
    "*Sous-catégories*\n" +
    "• /subcatlist <hash|weed|extraction|wpff>\n" +
    "• /subcatadd <type> <label> [sort]\n" +
    "• /subcattoggle <id>\n\n" +
    "*Stats*\n" +
    "• /stat — stats 7 jours\n\n" +
    "*Debug*\n" +
    "• /dbtest\n";
  bot.sendMessage(chatId, txt, { parse_mode: "Markdown" });
}

bot.onText(/^\/start$/, async (msg) => {
  const chatId = msg.chat.id;
  await track("start", { tg_user_id: msg.from?.id ?? null, tg_chat_id: chatId });

  bot.sendMessage(chatId, "🌾 *HarvestDex*\n\nOuvre le Dex 👇", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📘 Ouvrir HarvestDex", web_app: { url: WEBAPP_URL } }],
        [{ text: "⭐ Mon Dex", web_app: { url: WEBAPP_URL } }],
        [{ text: "🤝 Soutenir", callback_data: "support_menu" }],
        [{ text: "🧰 Admin", callback_data: "admin_menu" }],
      ],
    },
  });
});

bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  if (data === "support_menu") return sendSupportMenu(chatId);
  if (data === "support_games") return sendGamesMenu(chatId);

  if (data === "admin_menu") {
    if (!isAdmin(q.from?.id)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");
    return sendAdminCommands(chatId);
  }
});

// =====================
// BOT — BASIC
// =====================
bot.onText(/^\/commands$/, async (msg) => {
  if (!isAdmin(msg.from?.id)) return bot.sendMessage(msg.chat.id, "⛔ Pas autorisé.");
  sendAdminCommands(msg.chat.id);
});

bot.onText(/^\/dbtest$/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await dbListCards();
    bot.sendMessage(chatId, "✅ Supabase OK");
  } catch (e) {
    bot.sendMessage(chatId, `❌ Supabase ERROR: ${e.message}`);
  }
});

bot.onText(/^\/list$/, async (msg) => {
  if (!isAdmin(msg.from?.id)) return bot.sendMessage(msg.chat.id, "⛔ Pas autorisé.");
  const cards = await dbListCards();
  const lines = cards.slice(0, 200).map((c) => `#${c.id} • ${c.name} • ${typeLabel(c.type)} • ${c.season || "—"} • ${c.rarity || "COMMON"}`);
  bot.sendMessage(msg.chat.id, lines.join("\n") || "Aucune fiche.");
});

// featured
bot.onText(/^\/rare\s+(\d+)$/i, async (msg, m) => {
  if (!isAdmin(msg.from?.id)) return bot.sendMessage(msg.chat.id, "⛔ Pas autorisé.");
  const id = Number(m[1]);
  await sb.from("cards").update({ is_featured: false }).neq("id", 0);
  const { error } = await sb.from("cards").update({ is_featured: true }).eq("id", id);
  if (error) return bot.sendMessage(msg.chat.id, `❌ Error: ${error.message}`);
  bot.sendMessage(msg.chat.id, `✨ Shiny set: #${id}`);
});
bot.onText(/^\/unrare$/i, async (msg) => {
  if (!isAdmin(msg.from?.id)) return bot.sendMessage(msg.chat.id, "⛔ Pas autorisé.");
  const { error } = await sb.from("cards").update({ is_featured: false }).eq("is_featured", true);
  if (error) return bot.sendMessage(msg.chat.id, `❌ Error: ${error.message}`);
  bot.sendMessage(msg.chat.id, "✅ Shiny removed");
});

// seasons
bot.onText(/^\/seasonlist$/i, async (msg) => {
  if (!isAdmin(msg.from?.id)) return bot.sendMessage(msg.chat.id, "⛔ Pas autorisé.");
  const s = await dbEnsureDefaultSeason();
  const lines = s.map((x) => `${x.is_active ? "✅" : "▫️"} ${x.id} — ${x.label}`);
  bot.sendMessage(msg.chat.id, lines.join("\n") || "Aucune saison.");
});
bot.onText(/^\/seasonadd\s+(\S+)\s+(.+)$/i, async (msg, m) => {
  if (!isAdmin(msg.from?.id)) return bot.sendMessage(msg.chat.id, "⛔ Pas autorisé.");
  const id = m[1].trim();
  const label = m[2].trim();
  await dbAddSeason(id, label);
  bot.sendMessage(msg.chat.id, `✅ Saison ajoutée: ${id} — ${label}`);
});
bot.onText(/^\/seasonactive\s+(\S+)$/i, async (msg, m) => {
  if (!isAdmin(msg.from?.id)) return bot.sendMessage(msg.chat.id, "⛔ Pas autorisé.");
  const id = m[1].trim();
  await dbSetActiveSeason(id);
  bot.sendMessage(msg.chat.id, `✅ Saison active: ${id}`);
});
bot.onText(/^\/seasonbulk\s+(.+)$/i, async (msg, m) => {
  if (!isAdmin(msg.from?.id)) return bot.sendMessage(msg.chat.id, "⛔ Pas autorisé.");
  const years = m[1].split(/\s+/).map((x) => x.trim()).filter(Boolean);
  const nums = years.map((y) => parseInt(y, 10)).filter((n) => !Number.isNaN(n));
  if (nums.length < 1) return bot.sendMessage(msg.chat.id, "Usage: /seasonbulk 26 27 28");
  let created = 0;
  for (let i = 0; i < nums.length; i++) {
    const a = nums[i];
    const b = a + 1;
    const id = `${a}-${b}`;
    const label = `Harvest ${id}`;
    try { await dbAddSeason(id, label); created++; } catch {}
  }
  bot.sendMessage(msg.chat.id, `✅ Saisons assurées: ${created}`);
});

// subcategories
bot.onText(/^\/subcatlist\s+(hash|weed|extraction|wpff)$/i, async (msg, m) => {
  if (!isAdmin(msg.from?.id)) return bot.sendMessage(msg.chat.id, "⛔ Pas autorisé.");
  const type = m[1].toLowerCase();
  const subs = await dbListSubcategories(type);
  const lines = subs.map((s) => `${s.is_active ? "✅" : "▫️"} #${s.id} • ${s.label} (sort:${s.sort ?? 0})`);
  bot.sendMessage(msg.chat.id, lines.join("\n") || "Aucune sous-catégorie.");
});

bot.onText(/^\/subcatadd\s+(hash|weed|extraction|wpff)\s+(.+?)(?:\s+(\d+))?$/i, async (msg, m) => {
  if (!isAdmin(msg.from?.id)) return bot.sendMessage(msg.chat.id, "⛔ Pas autorisé.");
  const type = m[1].toLowerCase();
  const label = m[2].trim();
  const sort = m[3] ? Number(m[3]) : 100;
  await dbAddSubcategory(type, label, sort, true);
  bot.sendMessage(msg.chat.id, `✅ Subcat ajoutée: ${type} — ${label} (sort:${sort})`);
});

bot.onText(/^\/subcattoggle\s+(\d+)$/i, async (msg, m) => {
  if (!isAdmin(msg.from?.id)) return bot.sendMessage(msg.chat.id, "⛔ Pas autorisé.");
  const id = Number(m[1]);
  const newState = await dbToggleSubcategory(id);
  bot.sendMessage(msg.chat.id, `✅ Subcat #${id} -> ${newState ? "active" : "inactive"}`);
});

// =====================
// STATS (admin)
// =====================
bot.onText(/^\/stat$/i, async (msg) => {
  if (!isAdmin(msg.from?.id)) return bot.sendMessage(msg.chat.id, "⛔ Pas autorisé.");
  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { count: totalCards } = await sb.from("cards").select("*", { count: "exact", head: true });
    const { data: events, error } = await sb.from("track_events").select("tg_user_id,event_type,created_at").gte("created_at", since);
    if (error) throw error;
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
// WEBAPP sendData (share)
// =====================
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  if (msg.web_app_data && msg.web_app_data.data) {
    const payload = safeJsonParse(msg.web_app_data.data);
    if (!payload) return;

    if (payload.type === "share_card" && payload.card_id) {
      try {
        const id = Number(payload.card_id);
        const { data, error } = await sb.from("cards").select("*").eq("id", id).single();
        if (error) throw error;

        const text =
          `🧬 *${data.name}* (#${data.id})\n` +
          `• Type: *${typeLabel(data.type)}*\n` +
          `• Saison: *${data.season || "—"}*\n` +
          `• Rareté: *${data.rarity || "COMMON"}*\n` +
          `• THC: ${data.thc || "—"}\n\n` +
          `${data.description || "—"}`;

        bot.sendMessage(chatId, text, {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "📘 Ouvrir HarvestDex", web_app: { url: WEBAPP_URL } }]] },
        });

        await track("share", { tg_user_id: msg.from?.id ?? null, tg_chat_id: chatId, card_id: data.id, card_name: data.name });
      } catch (e) {
        bot.sendMessage(chatId, `❌ Share error: ${e.message}`);
      }
    }
  }
});

// =====================
// /addform WIZARD (admin)
// =====================
const wizard = new Map(); // chatId -> { step, data }
const wset = (chatId, obj) => wizard.set(String(chatId), obj);
const wget = (chatId) => wizard.get(String(chatId));
const wclear = (chatId) => wizard.delete(String(chatId));

async function askSeason(chatId) {
  const seasons = await dbEnsureDefaultSeason();
  const keyboard = seasons.slice(0, 30).map((x) => [{ text: x.label + (x.is_active ? " ✅" : ""), callback_data: `w_season:${x.id}` }]);
  bot.sendMessage(chatId, "🗓️ Choisis la saison :", { reply_markup: { inline_keyboard: keyboard } });
}
function askType(chatId) {
  bot.sendMessage(chatId, "📦 Choisis le type :", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Hash", callback_data: "w_type:hash" }, { text: "Weed", callback_data: "w_type:weed" }],
        [{ text: "Extraction", callback_data: "w_type:extraction" }, { text: "WPFF", callback_data: "w_type:wpff" }],
      ],
    },
  });
}
async function askSubcategory(chatId, type) {
  const subs = await dbListSubcategories(type);
  const active = subs.filter((s) => s.is_active);
  const keyboard = [[{ text: "— Aucune —", callback_data: "w_sub:none" }]];
  for (const s of active.slice(0, 30)) keyboard.push([{ text: s.label, callback_data: `w_sub:${s.id}` }]);
  bot.sendMessage(chatId, "🧩 Sous-catégorie (optionnel) :", { reply_markup: { inline_keyboard: keyboard } });
}
function askWeedKind(chatId) {
  bot.sendMessage(chatId, "🌿 Weed kind :", {
    reply_markup: { inline_keyboard: [
      [{ text: "Indica", callback_data: "w_weedkind:indica" }, { text: "Sativa", callback_data: "w_weedkind:sativa" }],
      [{ text: "Hybrid", callback_data: "w_weedkind:hybrid" }],
    ]},
  });
}
function askMicron(chatId) {
  bot.sendMessage(chatId, "🧪 Micron :", {
    reply_markup: { inline_keyboard: [
      [{ text: "120u", callback_data: "w_micron:120u" }, { text: "90u", callback_data: "w_micron:90u" }],
      [{ text: "73u", callback_data: "w_micron:73u" }, { text: "45u", callback_data: "w_micron:45u" }],
      [{ text: "— Aucun —", callback_data: "w_micron:none" }],
    ]},
  });
}
function askRarity(chatId) {
  bot.sendMessage(chatId, "💎 Rareté :", {
    reply_markup: { inline_keyboard: [
      [{ text: "COMMON", callback_data: "w_rarity:COMMON" }, { text: "RARE", callback_data: "w_rarity:RARE" }],
      [{ text: "EPIC", callback_data: "w_rarity:EPIC" }, { text: "LEGENDARY", callback_data: "w_rarity:LEGENDARY" }],
      [{ text: "MYTHIC", callback_data: "w_rarity:MYTHIC" }],
    ]},
  });
}

bot.onText(/^\/addform$/i, async (msg) => {
  if (!isAdmin(msg.from?.id)) return bot.sendMessage(msg.chat.id, "⛔ Pas autorisé.");
  wset(msg.chat.id, { step: "name", data: {} });
  bot.sendMessage(msg.chat.id, "🧬 Nom de la fiche ? (envoie le texte)");
});

bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const st = wget(chatId);
  const data = q.data || "";

  if (!st || !data.startsWith("w_")) return;

  try {
    if (data.startsWith("w_season:")) {
      st.data.season = data.split(":")[1];
      st.step = "type";
      wset(chatId, st);
      await bot.answerCallbackQuery(q.id);
      return askType(chatId);
    }

    if (data.startsWith("w_type:")) {
      st.data.type = data.split(":")[1];
      st.step = "subcat";
      wset(chatId, st);
      await bot.answerCallbackQuery(q.id);
      return askSubcategory(chatId, st.data.type);
    }

    if (data.startsWith("w_sub:")) {
      const v = data.split(":")[1];
      st.data.subcategory_id = v === "none" ? null : Number(v);

      if (st.data.type === "weed") {
        st.step = "weed_kind";
        wset(chatId, st);
        await bot.answerCallbackQuery(q.id);
        return askWeedKind(chatId);
      } else {
        st.step = "micron";
        wset(chatId, st);
        await bot.answerCallbackQuery(q.id);
        return askMicron(chatId);
      }
    }

    if (data.startsWith("w_weedkind:")) {
      st.data.weed_kind = data.split(":")[1];
      st.data.micron = null;
      st.step = "rarity";
      wset(chatId, st);
      await bot.answerCallbackQuery(q.id);
      return askRarity(chatId);
    }

    if (data.startsWith("w_micron:")) {
      const v = data.split(":")[1];
      st.data.micron = v === "none" ? null : v;
      st.data.weed_kind = null;
      st.step = "rarity";
      wset(chatId, st);
      await bot.answerCallbackQuery(q.id);
      return askRarity(chatId);
    }

    if (data.startsWith("w_rarity:")) {
      st.data.rarity = data.split(":")[1];
      st.step = "thc";
      wset(chatId, st);
      await bot.answerCallbackQuery(q.id);
      return bot.sendMessage(chatId, "🔥 THC (ex: `70–90%`) ? (ou `—`)", { parse_mode: "Markdown" });
    }
  } catch (e) {
    bot.sendMessage(chatId, `❌ Wizard error: ${e.message}`);
    wclear(chatId);
  }
});

// wizard text steps
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const st = wget(chatId);
  if (!st) return;

  if (msg.text && msg.text.startsWith("/") && st.step !== "name") return;

  try {
    if (st.step === "name") {
      if (!msg.text) return;
      st.data.name = String(msg.text).trim();
      st.step = "season";
      wset(chatId, st);
      return askSeason(chatId);
    }

    if (st.step === "thc") {
      st.data.thc = msg.text ? String(msg.text).trim() : "—";
      st.step = "description";
      wset(chatId, st);
      return bot.sendMessage(chatId, "🧬 Description / profil ? (texte)");
    }

    if (st.step === "description") {
      st.data.description = msg.text ? String(msg.text).trim() : "—";
      st.step = "img";
      wset(chatId, st);
      return bot.sendMessage(chatId, "🖼️ Image URL ? (ou `skip`)");
    }

    if (st.step === "img") {
      const t = (msg.text || "").trim();
      st.data.img = (t && t.toLowerCase() !== "skip") ? t : "";
      st.step = "terpenes";
      wset(chatId, st);
      return bot.sendMessage(chatId, "🌿 Terpènes (virgules) ? (ou `skip`)");
    }

    if (st.step === "terpenes") {
      const t = (msg.text || "").trim();
      st.data.terpenes = t.toLowerCase() === "skip" ? [] : parseCsv(t);
      st.step = "aroma";
      wset(chatId, st);
      return bot.sendMessage(chatId, "👃 Arômes (virgules) ? (ou `skip`)");
    }

    if (st.step === "aroma") {
      const t = (msg.text || "").trim();
      st.data.aroma = t.toLowerCase() === "skip" ? [] : parseCsv(t);
      st.step = "effects";
      wset(chatId, st);
      return bot.sendMessage(chatId, "🧠 Effets (virgules) ? (ou `skip`)");
    }

    if (st.step === "effects") {
      const t = (msg.text || "").trim();
      st.data.effects = t.toLowerCase() === "skip" ? [] : parseCsv(t);
      st.step = "advice";
      wset(chatId, st);
      return bot.sendMessage(chatId, "⚠️ Conseils / avertissement ? (ou `skip`)");
    }

    if (st.step === "advice") {
      const t = (msg.text || "").trim();
      st.data.advice = t.toLowerCase() === "skip" ? "" : t;

      const payload = {
        name: st.data.name,
        type: st.data.type,
        micron: st.data.micron ?? null,
        weed_kind: st.data.weed_kind ?? null,
        season: st.data.season ?? null,
        subcategory_id: st.data.subcategory_id ?? null,
        rarity: st.data.rarity ?? "COMMON",
        thc: st.data.thc ?? "—",
        description: st.data.description ?? "—",
        img: st.data.img ?? "",
        advice: st.data.advice ?? "",
        terpenes: st.data.terpenes ?? [],
        aroma: st.data.aroma ?? [],
        effects: st.data.effects ?? [],
      };

      const inserted = await dbInsertCard(payload);
      await track("card_create", { tg_user_id: msg.from?.id ?? null, tg_chat_id: chatId, card_id: inserted.id, card_name: inserted.name });

      wclear(chatId);

      return bot.sendMessage(chatId, `✅ Fiche créée: *${inserted.name}* (#${inserted.id})`, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "📘 Ouvrir HarvestDex", web_app: { url: WEBAPP_URL } }]] },
      });
    }
  } catch (e) {
    bot.sendMessage(chatId, `❌ Wizard error: ${e.message}`);
    wclear(chatId);
  }
});

// =====================
// SERVER
// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 HarvestDex running on :${PORT} — ${nowIso()}`));
