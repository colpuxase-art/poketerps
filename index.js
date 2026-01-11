const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();

// Serveur web pour Render / mini-app
const PORT = process.env.PORT || 3000;
app.use(express.static('public')); // dossier public pour reviews

// Bot Telegram
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('❌ TOKEN MANQUANT');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log('🤖 Bot Telegram démarré');

// Menu /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Bienvenue 👋\nQue veux-tu faire ?', {
    reply_markup: {
      keyboard: [
        ['📲 Nous suivre'],
        ['❤️ Nous soutenir'],
        ['⭐ Voir les reviews']
      ],
      resize_keyboard: true
    }
  });
});

// Actions des boutons
bot.on('message', (msg) => {
  const text = msg.text;
  const chatId = msg.chat.id;

  if (text === '📲 Nous suivre') {
    bot.sendMessage(chatId, 'Instagram : https://instagram.com/toncompte');
  }

  if (text === '❤️ Nous soutenir') {
    bot.sendMessage(chatId, 'Merci ❤️\nTu peux nous soutenir ici : https://paypal.me/tonlien');
  }

  if (text === '⭐ Voir les reviews') {
    bot.sendMessage(chatId, 'Voici nos avis clients 👇\nhttps://TON-SITE.onrender.com/reviews.html');
  }
});

// Serveur web
app.get('/', (req, res) => {
  res.send('Bot Telegram actif');
});

app.listen(PORT, () => {
  console.log(`🌐 Serveur web actif sur le port ${PORT}`);
});
