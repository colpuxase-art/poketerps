
/* =========================================================
   HARVESTDEX — FINAL
   - Subcategories visible in app
   - MyDex per user + profile page
   - /start rich menu (info / support)
   ========================================================= */
const express = require("express");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!BOT_TOKEN || !WEBAPP_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("Missing env vars");
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

const ADMIN_IDS = new Set([6675436692]);
const isAdmin = (id) => ADMIN_IDS.has(Number(id));

// ---------------- API ----------------
app.get("/api/cards", async (req, res) => {
  const { data } = await sb.from("cards").select("*").order("created_at", { ascending: false });
  res.set("Cache-Control", "no-store");
  res.json(data || []);
});

app.get("/api/subcategories", async (req, res) => {
  const { data } = await sb.from("subcategories").select("*").eq("is_active", true);
  res.set("Cache-Control", "no-store");
  res.json(data || []);
});

app.get("/api/mydex/:uid", async (req, res) => {
  const uid = Number(req.params.uid);
  const { data } = await sb.from("favorites").select("cards(*)").eq("user_id", uid);
  res.json((data || []).map(x => x.cards).filter(Boolean));
});

app.post("/api/favorite", async (req, res) => {
  const { user_id, card_id } = req.body;
  const { data: exists } = await sb.from("favorites")
    .select("id")
    .eq("user_id", user_id)
    .eq("card_id", card_id)
    .maybeSingle();

  if (exists) {
    await sb.from("favorites").delete().eq("id", exists.id);
    return res.json({ favorited: false });
  }
  await sb.from("favorites").insert({ user_id, card_id });
  res.json({ favorited: true });
});

// ---------------- BOT /start ----------------
bot.onText(/^\/start$/, async (msg) => {
  bot.sendMessage(msg.chat.id,
    "🌾 *HARVESTDEX*\n\nLe Dex communautaire.\nSaisons • Raretés • Collections",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📘 Ouvrir le Dex", web_app: { url: WEBAPP_URL } }],
          [{ text: "ℹ️ Informations", callback_data: "info" }],
          [{ text: "🤝 Nous soutenir", callback_data: "support" }]
        ]
      }
    }
  );
});

bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  if (q.data === "info") {
    bot.sendMessage(chatId,
      "ℹ️ *HarvestDex*\n\nCollectionne des fiches, ajoute-les à ton Dex personnel et découvre les raretés par saison.",
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "back" }]] } }
    );
  }
  if (q.data === "support") {
    bot.sendMessage(chatId,
      "🤝 *Nous soutenir*",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📣 Nous suivre", url: "https://t.me/" }],
            [{ text: "🎮 Jouer", url: "https://example.com" }],
            [{ text: "💛 Faire un don", url: "https://t.me/" }],
            [{ text: "🤝 Nos partenaires", callback_data: "partners" }],
            [{ text: "⬅️ Retour", callback_data: "back" }]
          ]
        }
      }
    );
  }
  if (q.data === "partners") {
    bot.sendMessage(chatId,
      "🤝 *Partenaires*\n\nAucun partenaire pour le moment.\nVeuillez nous contacter.",
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "support" }]] } }
    );
  }
  if (q.data === "back") {
    bot.emit("text", q.message, ["/start"]);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("HarvestDex running"));
