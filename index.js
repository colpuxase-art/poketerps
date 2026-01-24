/* =========================================================
   HARVESTDEX — BOT + API (COMMONJS, Render-friendly)
   ========================================================= */

const express = require("express");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");

// =====================
// ENV
// =====================
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL; // ex: https://yourapp.onrender.com
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !WEBAPP_URL) {
  console.error("❌ Missing ENV vars. Required: BOT_TOKEN, WEBAPP_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE");
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
const ADMIN_IDS = new Set([
  6675436692, // <-- TON ID TELEGRAM
]);

const isAdmin = (chatIdOrUserId) => ADMIN_IDS.has(Number(chatIdOrUserId));

// =====================
// SMALL HELPERS
// =====================
const typeLabel = (t) =>
  ({ hash: "Hash", weed: "Weed", extraction: "Extraction", wpff: "WPFF" }[t] || t);

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
// TRACKING (optional)
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
    const enabled = await trackingEnabled();
    if (!enabled) return;
    await sb.from("track_events").insert({ event_type, ...payload });
  } catch {
    // silent
  }
}

// =====================
// DB HELPERS
// =====================
async function dbListCards() {
  const { data, error } = await sb
    .from("cards")
    .select("*, subcategories(id,label,type)")
    .order("created_at", { ascending: false });
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

async function dbSetActiveSeason(id) {
  // set all false then true
  await sb.from("seasons").update({ is_active: false }).neq("id", "");
  const { error } = await sb.from("seasons").update({ is_active: true }).eq("id", id);
  if (error) throw error;
}

async function dbAddSeason(id, label) {
  const { error } = await sb.from("seasons").upsert({ id, label, is_active: false });
  if (error) throw error;
}

async function dbListSubcategories(type) {
  const { data } = await sb
    .from("subcategories")
    .select("*")
    .eq("type", type)
    .eq("is_active", true)
    .order("sort", { ascending: true });
  return data || [];
}

// =====================
// API — MINI APP
// =====================
app.get("/api/cards", async (req, res) => {
  try {
    const cards = await dbListCards();
    const mapped = cards.map((c) => ({
      ...c,
      desc: c.description ?? "—", // compat front
    }));

    // anti-cache (important in Telegram WebView)
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
    const { data, error } = await sb
      .from("favorites")
      .select("cards(*)")
      .eq("user_id", uid);
    if (error) throw error;
    res.set("Cache-Control", "no-store");
    res.json((data || []).map((x) => x.cards).filter(Boolean));
  } catch (e) {
    res.status(500).json({ error: "mydex_failed", message: e.message });
  }
});

// =====================
// BOT — START / MENU
// =====================
bot.onText(/^\/start$/, async (msg) => {
  const chatId = msg.chat.id;

  await track("start", {
    tg_user_id: msg.from?.id ?? null,
    tg_chat_id: chatId,
  });

  bot.sendMessage(chatId, "🌾 *HarvestDex*\n\nOuvre le Dex 👇", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📘 Ouvrir HarvestDex", web_app: { url: WEBAPP_URL } }],
        [{ text: "🧰 Admin", callback_data: "admin_menu" }],
        [{ text: "🤝 Soutenir", callback_data: "support_menu" }],
      ],
    },
  });
});

// =====================
// BOT — SUPPORT SUBMENUS
// =====================
const SUPPORT_FOLLOW_URL = process.env.SUPPORT_FOLLOW_URL || "https://t.me/";
const SUPPORT_DONATE_URL = process.env.SUPPORT_DONATE_URL || "https://t.me/";
const GAME_MOTO_URL = process.env.GAME_MOTO_URL || "https://example.com/moto";
const GAME_DRIFT_URL = process.env.GAME_DRIFT_URL || "https://example.com/drift";

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

// =====================
// BOT — ADMIN HELP (admin only)
// =====================
function sendAdminHelp(chatId) {
  const txt =
    "🧰 *Admin HarvestDex*\n\n" +
    "📌 *Fiches*\n" +
    "• /addform — ajouter une fiche (wizard)\n" +
    "• /list — lister les fiches\n" +
    "• /rare <id> — mettre en shiny\n" +
    "• /unrare — enlever shiny\n\n" +
    "📌 *Saisons*\n" +
    "• /seasonlist\n" +
    "• /seasonadd <25-26> <label>\n" +
    "• /seasonactive <25-26>\n" +
    "• /seasonbulk <26 27 28> (crée 26-27, 27-28, 28-29)\n\n" +
    "📊 *Stats*\n" +
    "• /stat — stats (7j)\n\n" +
    "🧪 *Debug*\n" +
    "• /dbtest";
  bot.sendMessage(chatId, txt, { parse_mode: "Markdown" });
}

bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  if (data === "support_menu") return sendSupportMenu(chatId);
  if (data === "support_games") return sendGamesMenu(chatId);

  if (data === "admin_menu") {
    if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");
    return sendAdminHelp(chatId);
  }
});

// =====================
// BOT — DB TEST
// =====================
bot.onText(/^\/dbtest$/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await dbListCards();
    bot.sendMessage(chatId, "✅ Supabase OK");
  } catch (e) {
    bot.sendMessage(chatId, `❌ Supabase ERROR: ${e.message}`);
  }
});

// =====================
// BOT — LIST (ADMIN)
// =====================
bot.onText(/^\/list$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  const cards = await dbListCards();
  const lines = cards.slice(0, 200).map((c) => `#${c.id} • ${c.name} • ${typeLabel(c.type)} • ${c.season || "—"} • ${c.rarity || "COMMON"}`);
  bot.sendMessage(chatId, lines.join("\n") || "Aucune fiche.");
});

// =====================
// BOT — FEATURED
// =====================
bot.onText(/^\/rare\s+(\d+)$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");
  const id = Number(match[1]);

  await sb.from("cards").update({ is_featured: false }).neq("id", 0);
  const { error } = await sb.from("cards").update({ is_featured: true }).eq("id", id);
  if (error) return bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  bot.sendMessage(chatId, `✨ Shiny set: #${id}`);
});

bot.onText(/^\/unrare$/i, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  const { error } = await sb.from("cards").update({ is_featured: false }).eq("is_featured", true);
  if (error) return bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  bot.sendMessage(chatId, "✅ Shiny removed");
});

// =====================
// BOT — SEASONS (ADMIN)
// =====================
bot.onText(/^\/seasonlist$/i, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  const s = await dbListSeasons();
  const lines = s.map((x) => `${x.is_active ? "✅" : "▫️"} ${x.id} — ${x.label}`);
  bot.sendMessage(chatId, lines.join("\n") || "Aucune saison.");
});

bot.onText(/^\/seasonadd\s+(\S+)\s+(.+)$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  const id = match[1].trim();
  const label = match[2].trim();
  try {
    await dbAddSeason(id, label);
    bot.sendMessage(chatId, `✅ Saison ajoutée: ${id} — ${label}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ Error: ${e.message}`);
  }
});

bot.onText(/^\/seasonactive\s+(\S+)$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  const id = match[1].trim();
  try {
    await dbSetActiveSeason(id);
    bot.sendMessage(chatId, `✅ Saison active: ${id}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ Error: ${e.message}`);
  }
});

bot.onText(/^\/seasonbulk\s+(.+)$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  // /seasonbulk 26 27 28  -> creates 26-27, 27-28, 28-29
  const years = match[1].split(/\s+/).map((x) => x.trim()).filter(Boolean);
  const nums = years.map((y) => parseInt(y, 10)).filter((n) => !Number.isNaN(n));
  if (nums.length < 2) return bot.sendMessage(chatId, "Usage: /seasonbulk 26 27 28");

  let created = 0;
  for (let i = 0; i < nums.length; i++) {
    const a = nums[i];
    const b = nums[i] + 1;
    const id = `${a}-${b}`;
    const label = `Harvest ${id}`;
    try {
      await dbAddSeason(id, label);
      created++;
    } catch {}
  }
  bot.sendMessage(chatId, `✅ Saisons générées/assurées: ${created}`);
});

// =====================
// BOT — /stat (ADMIN) (7 days)
// =====================
bot.onText(/^\/stat$/i, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();

    const { count: totalCards } = await sb
      .from("cards")
      .select("*", { count: "exact", head: true });

    const { data: events, error: e1 } = await sb
      .from("track_events")
      .select("event_type, tg_user_id, card_id, card_name, created_at")
      .gte("created_at", since);
    if (e1) throw e1;

    const totalEvents = events.length;
    const uniqUsers = new Set(events.map((e) => e.tg_user_id).filter(Boolean)).size;

    // top views
    const views = events.filter((e) => e.event_type === "card_view" && e.card_id);
    const viewMap = new Map();
    for (const v of views) {
      const k = String(v.card_id);
      viewMap.set(k, (viewMap.get(k) || 0) + 1);
    }
    const topViews = [...viewMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    // top favorites global
    const { data: topFavs, error: e2 } = await sb
      .from("favorites")
      .select("card_id, cards(name)")
      .limit(5000);
    if (e2) throw e2;
    const favMap = new Map();
    for (const f of topFavs) {
      const k = String(f.card_id);
      favMap.set(k, { name: f.cards?.name || `#${f.card_id}`, n: (favMap.get(k)?.n || 0) + 1 });
    }
    const topFav = [...favMap.entries()].map(([id, o]) => ({ id, ...o })).sort((a, b) => b.n - a.n).slice(0, 5);

    const lines = [];
    lines.push("📊 *HarvestDex — Stats (7 jours)*");
    lines.push("");
    lines.push(`• Fiches: *${totalCards || 0}*`);
    lines.push(`• Events: *${totalEvents}*`);
    lines.push(`• Users uniques: *${uniqUsers}*`);
    lines.push("");
    lines.push("*Top vues:*");
    if (!topViews.length) lines.push("—");
    for (const [id, n] of topViews) lines.push(`• #${id} — ${n}`);

    lines.push("");
    lines.push("*Top favoris:*");
    if (!topFav.length) lines.push("—");
    for (const x of topFav) lines.push(`• ${x.name} (#${x.id}) — ${x.n}`);

    bot.sendMessage(chatId, lines.join("\n"), { parse_mode: "Markdown" });
  } catch (e) {
    bot.sendMessage(chatId, `❌ /stat error: ${e.message}`);
  }
});

// =====================
// BOT — WEBAPP share handler (tg.sendData)
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
          reply_markup: {
            inline_keyboard: [[{ text: "📘 Ouvrir HarvestDex", web_app: { url: WEBAPP_URL } }]],
          },
        });

        await track("share", { tg_user_id: msg.from?.id ?? null, tg_chat_id: chatId, card_id: data.id, card_name: data.name });
      } catch (e) {
        bot.sendMessage(chatId, `❌ Share error: ${e.message}`);
      }
    }
  }
});

// =====================
// BOT — ADD FORM (ADMIN) — wizard
// =====================
const wizard = new Map(); // chatId -> { step, data }

function wset(chatId, obj) { wizard.set(String(chatId), obj); }
function wget(chatId) { return wizard.get(String(chatId)); }
function wclear(chatId) { wizard.delete(String(chatId)); }

async function askSeason(chatId) {
  const s = await dbListSeasons();
  if (!s.length) {
    await dbAddSeason("25-26", "Harvest 25-26");
  }
  const seasons2 = await dbListSeasons();
  const keyboard = seasons2.slice(0, 20).map((x) => [{ text: x.label, callback_data: `w_season:${x.id}` }]);
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
  const keyboard = [
    [{ text: "— Aucune —", callback_data: "w_sub:none" }]
  ];
  for (const s of subs.slice(0, 30)) {
    keyboard.push([{ text: s.label, callback_data: `w_sub:${s.id}` }]);
  }
  bot.sendMessage(chatId, "🧩 Sous-catégorie (optionnel) :", { reply_markup: { inline_keyboard: keyboard } });
}

function askWeedKind(chatId) {
  bot.sendMessage(chatId, "🌿 Weed kind :", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Indica", callback_data: "w_weedkind:indica" }, { text: "Sativa", callback_data: "w_weedkind:sativa" }],
        [{ text: "Hybrid", callback_data: "w_weedkind:hybrid" }],
      ],
    },
  });
}

function askMicron(chatId) {
  bot.sendMessage(chatId, "🧪 Micron :", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "120u", callback_data: "w_micron:120u" }, { text: "90u", callback_data: "w_micron:90u" }],
        [{ text: "73u", callback_data: "w_micron:73u" }, { text: "45u", callback_data: "w_micron:45u" }],
        [{ text: "— Aucun —", callback_data: "w_micron:none" }],
      ],
    },
  });
}

function askRarity(chatId) {
  bot.sendMessage(chatId, "💎 Rareté :", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "COMMON", callback_data: "w_rarity:COMMON" }, { text: "RARE", callback_data: "w_rarity:RARE" }],
        [{ text: "EPIC", callback_data: "w_rarity:EPIC" }, { text: "LEGENDARY", callback_data: "w_rarity:LEGENDARY" }],
        [{ text: "MYTHIC", callback_data: "w_rarity:MYTHIC" }],
      ],
    },
  });
}

bot.onText(/^\/addform$/i, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  wset(chatId, { step: "name", data: {} });
  bot.sendMessage(chatId, "🧬 Nom de la fiche ? (envoie le texte)");
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
      // next: weed_kind or micron depending
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
      return bot.sendMessage(chatId, "🔥 THC (ex: `THC: 70–90%`) ?", { parse_mode: "Markdown" });
    }
  } catch (e) {
    bot.sendMessage(chatId, `❌ Wizard error: ${e.message}`);
  }
});

// wizard text steps
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const st = wget(chatId);
  if (!st) return;

  // ignore commands while wizard
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
      return bot.sendMessage(chatId, "🌿 Terpènes (séparés par des virgules) ? (ou `skip`)");
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

      // insert
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

      return bot.sendMessage(
        chatId,
        `✅ Fiche créée: *${inserted.name}* (#${inserted.id})\n\nOuvre la mini-app et rafraîchis.`,
        {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "📘 Ouvrir HarvestDex", web_app: { url: WEBAPP_URL } }]] },
        }
      );
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
app.listen(PORT, () => console.log(`🚀 HarvestDex running on :${PORT}`));
