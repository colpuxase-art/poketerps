const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ⚠️ TON TOKEN (mets-le plus tard dans .env, mais ok pour l’instant)
const TOKEN = "8549074065:AAGlqwKJRSmpnQsdZkPgVeGkC8jpW4x9zv0";

const bot = new TelegramBot(TOKEN, { polling: true });


// ================= MENU /START =================

function sendStartMenu(chatId) {
  bot.sendMessage(chatId, "Bienvenue dans **PokéTerps 🧬**", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📘 Pokédex", callback_data: "pokedex" }
        ],
        [
          { text: "ℹ️ Informations", callback_data: "info" }
        ],
        [
          { text: "⭐ Reviews", callback_data: "reviews" }
        ],
        [
          { text: "❤️ Soutenir", url: "https://t.me/TON_LIEN" }
        ]
      ]
    }
  });
}

bot.onText(/\/start/, (msg) => {
  sendStartMenu(msg.chat.id);
});


// ================= BOUTONS =================

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;

  // Nettoie le bouton "chargement"
  bot.answerCallbackQuery(query.id);

  // ===== INFORMATIONS =====
  if (query.data === "info") {
    await bot.deleteMessage(chatId, messageId);

    bot.sendPhoto(
      chatId,
      "https://i.imgur.com/6QKJZ7X.jpg", // 👉 remplace par TON image
      {
        caption:
          "🌿 *PokéTerps – Informations*\n\n" +
          "PokéTerps est un projet éducatif autour :\n\n" +
          "🧬 *THC* : informations générales, effets, prévention\n" +
          "🌱 *Terpènes* : arômes, profils, propriétés\n" +
          "🧠 *Sensibilisation* & usage responsable\n\n" +
          "_Ce bot ne fait aucune vente._",
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⬅️ Retour", callback_data: "back" }
            ]
          ]
        }
      }
    );
  }

  // ===== RETOUR MENU =====
  if (query.data === "back") {
    await bot.deleteMessage(chatId, messageId);
    sendStartMenu(chatId);
  }

  // ===== EXEMPLES AUTRES =====
  if (query.data === "pokedex") {
    bot.sendMessage(chatId, "📘 Pokédex bientôt disponible 👀");
  }

  if (query.data === "reviews") {
    bot.sendMessage(chatId, "⭐ Section Reviews en préparation");
  }
});


// ================= SERVER =================

app.listen(PORT, () => {
  console.log("Serveur PokéTerps lancé sur le port", PORT);
});
