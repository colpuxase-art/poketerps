const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");

const app = express();
app.use(express.json());

// ✅ Sert les fichiers du dossier public
app.use(express.static(path.join(__dirname, "public")));

// ✅ Fix "Cannot GET /"
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;

// ⚠️ Ton token (mais je te conseille VRAIMENT de le régénérer vu qu’il a été partagé)
const TOKEN = "8549074065:AAGlqwKJRSmpnQsdZkPgVeGkC8jpW4x9zv0";

const bot = new TelegramBot(TOKEN, { polling: true });

// ================= MENU /START =================
function sendStartMenu(chatId) {
  bot.sendPhoto(chatId, "https://picsum.photos/900/500", {
    caption: "🧬 *Bienvenue dans PokéTerps*",
    parse_mode: "Markdown"
  }).then(() => {
    bot.sendMessage(chatId, "Choisis une section 👇", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📘 Pokédex",
              web_app: { url: "https://poketerps.onrender.com" }
            }
          ],
          [{ text: "ℹ️ Informations", callback_data: "info" }],
          [{ text: "⭐ Reviews", callback_data: "reviews" }],
          [{ text: "❤️ Soutenir", url: "https://t.me/TON_LIEN" }]
        ]
      }
    });
  });
}

bot.onText(/\/start/, (msg) => {
  sendStartMenu(msg.chat.id);
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  bot.answerCallbackQuery(query.id);

  if (query.data === "info") {
    bot.sendPhoto(chatId, "https://picsum.photos/900/501", {
      caption:
        "ℹ️ *Informations PokéTerps*\n\n" +
        "🌿 Projet éducatif sur le THC & les terpènes\n" +
        "🧬 THC : effets, risques, prévention\n" +
        "🌱 Terpènes : profils, arômes\n\n" +
        "_Aucune vente – information uniquement_",
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "back" }]] }
    });
  }

  if (query.data === "back") {
    sendStartMenu(chatId);
  }

  if (query.data === "reviews") {
    bot.sendMessage(chatId, "⭐ Reviews en préparation...");
  }
});

app.listen(PORT, () => console.log("Serveur PokéTerps lancé sur le port", PORT));
