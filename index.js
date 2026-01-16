const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const TOKEN = "8549074065:AAErrJ085ETg-MVBEncWStsOZ863Wl9QXfo"; // ton token
const bot = new TelegramBot(TOKEN, { polling: true });

// ===== BOT =====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendPhoto(chatId, 'https://ton-site.com/banner.jpg', {
    caption: `👋 Bienvenue sur *Ton Bot*\n\nClique sur un bouton pour continuer 👇`,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📘 Informations', callback_data: 'info' }],
        [{ text: '📞 Contact', callback_data: 'contact' }],
        [{ text: '🚀 Mini App', web_app: { url: 'https://ton-mini-app.com' } }]
      ]
    }
  });
});

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  if (query.data === 'info') {
    bot.sendMessage(chatId, 'Voici les informations...');
  } else if (query.data === 'contact') {
    bot.sendMessage(chatId, 'Voici comment nous contacter...');
  }
});

// ===== API REVIEWS =
