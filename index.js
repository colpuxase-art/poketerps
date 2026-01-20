const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");

/**
 * ✅ Chargement Supabase en mode "safe"
 * - Si le module n'est pas installé => on ne crashe pas
 * - Si les variables ENV manquent => on ne crashe pas
 */
let createClientSafe = null;
try {
  ({ createClient: createClientSafe } = require("@supabase/supabase-js"));
} catch (e) {
  console.error("⚠️ Supabase module manquant: npm i @supabase/supabase-js");
}

const app = express();
app.use(express.json());

// ✅ Static mini-app
app.use(express.static(path.join(__dirname, "public")));

// ✅ Fix Cannot GET /
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;

/* ================== ENV ================== */
const TOKEN = process.env.BOT_TOKEN || "8549074065:AAGoAsPPxiwhMig1i_-OUQgpVV15L2j0Sa0"; // token test
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";

/* ================== BOT ================== */
const bot = new TelegramBot(TOKEN, { polling: true });

/* ================== ADMIN ================== */
const ADMIN_IDS = new Set([6675436692]);
const isAdmin = (chatId) => ADMIN_IDS.has(chatId);

const allowedTypes = new Set(["hash", "weed", "extraction", "wpff"]);
const micronValues = ["120u", "90u", "73u", "45u"];
const isMicron = (v) => micronValues.includes(String(v || "").toLowerCase());

const csvToArr = (str) =>
  (str || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/* ================== SUPABASE CLIENT (SAFE) ================== */
let sb = null;
const supabaseReady = Boolean(createClientSafe && SUPABASE_URL && SUPABASE_SERVICE_ROLE);

if (supabaseReady) {
  sb = createClientSafe(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false },
  });
} else {
  console.error("⚠️ Supabase pas prêt (module ou ENV manquantes). Le bot tourne quand même.");
  if (!SUPABASE_URL) console.error("   - SUPABASE_URL manquant");
  if (!SUPABASE_SERVICE_ROLE) console.error("   - SUPABASE_SERVICE_ROLE manquant");
  if (!createClientSafe) console.error("   - @supabase/supabase-js non installé");
}

function assertSupabase() {
  if (!sb) {
    throw new Error(
      "Supabase KO. Vérifie: 1) npm i @supabase/supabase-js  2) Render ENV: SUPABASE_URL + SUPABASE_SERVICE_ROLE"
    );
  }
}

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

async function dbInsertCard(payload) {
  assertSupabase();
  const { data, error } = await sb.from("cards").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

async function dbInsertMany(rows) {
  assertSupabase();
  const { data, error } = await sb.from("cards").insert(rows).select("*");
  if (error) throw error;
  return data || [];
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

/* ================== API MINI-APP ================== */
app.get("/api/cards", async (req, res) => {
  try {
    const cards = await dbListCards();
    const mapped = cards.map((c) => ({
      ...c,
      desc: c.description ?? c.desc ?? "—", // compat front
    }));
    res.json(mapped);
  } catch (e) {
    console.error("❌ /api/cards:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ================= MENU /START ================= */
function sendStartMenu(chatId) {
  bot
    .sendPhoto(chatId, "https://picsum.photos/900/500", {
      caption: "🧬 *Bienvenue dans PokéTerps*",
      parse_mode: "Markdown",
    })
    .then(() => {
      return bot.sendMessage(chatId, "Choisis une section 👇", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📘 Pokédex", web_app: { url: "https://poketerps.onrender.com" } }],
            [{ text: "ℹ️ Informations", callback_data: "info" }],
            [{ text: "⭐ Reviews", callback_data: "reviews" }],
            [{ text: "❤️ Soutenir", url: "https://t.me/TON_LIEN" }],
          ],
        },
      });
    })
    .catch(() => {
      bot.sendMessage(chatId, "🧬 Bienvenue dans PokéTerps\nChoisis une section 👇", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📘 Pokédex", web_app: { url: "https://poketerps.onrender.com" } }],
            [{ text: "ℹ️ Informations", callback_data: "info" }],
            [{ text: "⭐ Reviews", callback_data: "reviews" }],
            [{ text: "❤️ Soutenir", url: "https://t.me/TON_LIEN" }],
          ],
        },
      });
    });
}

bot.onText(/^\/start$/, (msg) => sendStartMenu(msg.chat.id));

/* ================= COMMANDES ================= */
bot.onText(/^\/myid$/, (msg) => bot.sendMessage(msg.chat.id, `Ton chat_id = ${msg.chat.id}`));

bot.onText(/^\/adminhelp$/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  bot.sendMessage(
    chatId,
    "👑 *Admin PokéTerps*\n\n" +
      "✅ /dbtest\n" +
      "✅ /seed\n" +
      "✅ /list [hash|weed|extraction|wpff|120u|90u|73u|45u]\n" +
      "✅ /addform\n" +
      "✅ /editform\n" +
      "✅ /delform\n" +
      "✅ /edit id field value\n" +
      "✅ /del id\n\n" +
      "*fields:* name,type,micron,thc,description,img,advice,terpenes,aroma,effects",
    { parse_mode: "Markdown" }
  );
});

bot.onText(/^\/dbtest$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return;
  try {
    assertSupabase();
    const { data, error } = await sb.from("cards").select("id").limit(1);
    if (error) throw error;
    bot.sendMessage(chatId, "✅ Supabase OK (table cards accessible)");
  } catch (e) {
    bot.sendMessage(chatId, `❌ Supabase KO: ${e.message}`);
  }
});

bot.onText(/^\/seed$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const existing = await dbListCards();
    if (existing.length) {
      return bot.sendMessage(chatId, `⚠️ Il y a déjà ${existing.length} fiche(s). Je seed pas pour éviter les doublons.`);
    }

    const rows = [
      { name: "Bubble Hash 120u (exemple)", type: "hash", micron: "120u", thc: "THC: 35–50%", description: "Coupe 120u (profil éducatif).", img: "https://i.imgur.com/0HqWQvH.png", terpenes: ["Myrcene"], aroma: ["Terreux"], effects: ["Relax (ressenti)"], advice: "Commence bas. Respecte la loi." },
      { name: "Bubble Hash 90u (exemple)", type: "hash", micron: "90u", thc: "THC: 40–55%", description: "Coupe 90u (profil éducatif).", img: "https://i.imgur.com/0HqWQvH.png", terpenes: ["Limonene"], aroma: ["Agrumes"], effects: ["Bonne humeur (ressenti)"], advice: "Info éducative." },
      { name: "Bubble Hash 73u (exemple)", type: "hash", micron: "73u", thc: "THC: 45–60%", description: "Coupe 73u (profil éducatif).", img: "https://i.imgur.com/0HqWQvH.png", terpenes: ["Pinene"], aroma: ["Pin"], effects: ["Calme (ressenti)"], advice: "Évite de conduire." },
      { name: "Bubble Hash 45u (exemple)", type: "hash", micron: "45u", thc: "THC: 30–45%", description: "Coupe 45u (profil éducatif).", img: "https://i.imgur.com/0HqWQvH.png", terpenes: ["Humulene"], aroma: ["Boisé"], effects: ["Relax (ressenti)"], advice: "Attends avant de reprendre." },
    ];

    const inserted = await dbInsertMany(rows);
    bot.sendMessage(chatId, `✅ Seed OK: ${inserted.length} fiche(s) ajoutée(s).`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ Seed KO: ${e.message}`);
  }
});

bot.onText(/^\/list(?:\s+(\w+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const filter = (match[1] || "").toLowerCase();
    let cards = await dbListCards();
    if (filter) {
      if (isMicron(filter)) cards = cards.filter((c) => String(c.micron || "").toLowerCase() === filter);
      else cards = cards.filter((c) => String(c.type || "").toLowerCase() === filter);
    }

    if (!cards.length) return bot.sendMessage(chatId, "Aucune fiche.");

    const lines = cards
      .slice(0, 80)
      .map((c) => `#${c.id} • ${c.type}${c.micron ? " • " + c.micron : ""} • ${c.name}`)
      .join("\n");

    bot.sendMessage(chatId, `📚 Fiches (${cards.length})\n\n${lines}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /list: ${e.message}`);
  }
});

/* ================= CALLBACKS SIMPLE ================= */
bot.on("callback_query", async (query) => {
  const chatId = query.message?.chat?.id;
  try { await bot.answerCallbackQuery(query.id); } catch {}
  if (!chatId) return;

  if (query.data === "info") {
    return bot.sendMessage(chatId, "ℹ️ PokéTerps = projet éducatif THC & terpènes. Aucune vente.");
  }
  if (query.data === "reviews") {
    return bot.sendMessage(chatId, "⭐ Reviews en préparation...");
  }
});

/* ================= SERVER ================= */
app.listen(PORT, () => console.log("Serveur PokéTerps lancé sur le port", PORT));
