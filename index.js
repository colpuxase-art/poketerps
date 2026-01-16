const TelegramBot = require("node-telegram-bot-api");

// ⚠️ TON TOKEN (pense à le mettre en .env plus tard)
const TOKEN = "8549074065:AAGlqwKJRSmpnQsdZkPgVeGkC8jpW4x9zv0";

const bot = new TelegramBot(TOKEN, { polling: true });


// ================= MENU /START =================
function sendStartMenu(chatId) {
  // PHOTO AU DÉMARRAGE
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
              web_app: {
                url: "https://poketerps.onrender.com"
              }
            }
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
  });
}

// /start
bot.onText(/\/start/, (msg) => {
  sendStartMenu(msg.chat.id);
});


// ================= BOUTONS =================
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;

  // enlève le loading
  bot.answerCallbackQuery(query.id);

  // ===== INFORMATIONS =====
  if (query.data === "info") {
    bot.sendPhoto(chatId, "https://picsum.photos/900/501", {
      caption:
        "ℹ️ *Informations PokéTerps*\n\n" +
        "🌿 Projet éducatif sur le THC & les terpènes\n" +
        "🧬 THC : effets, risques, prévention\n" +
        "🌱 Terpènes : profils, arômes\n\n" +
        "_Aucune vente – information uniquement_",
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ Retour", callback_data: "back" }]
        ]
      }
    });
  }

  // ===== RETOUR MENU =====
  if (query.data === "back") {
    sendStartMenu(chatId);
  }

  // ===== REVIEWS =====
  if (query.data === "reviews") {
    bot.sendMessage(chatId, "⭐ Reviews en préparation...");
  }
});
