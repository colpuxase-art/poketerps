const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// ⚠️ TOKEN DIRECT (pour l’instant)
const TOKEN = "8549074065:AAF1WtGvuC-d6KJClSmPSyLt2wokCOVhyTs";

const bot = new TelegramBot(TOKEN, { polling: true });


// ===== BOT =====

bot.start((ctx) => {
  ctx.replyWithPhoto(
    { url: 'https://ton-site.com/banner.jpg' },
    {
      caption: `👋 Bienvenue sur *Ton Bot*\n\nClique sur un bouton pour continuer 👇`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📘 Informations', callback_data: 'info' }],
          [{ text: '📞 Contact', callback_data: 'contact' }],
          [{ text: '🚀 Mini App', web_app: { url: 'https://ton-mini-app.com' } }]
        ]
      }
    }
  )
})


// ===== API REVIEWS =====
app.get("/api/reviews", (req, res) => {
  const data = fs.readFileSync("data/reviews.json");
  res.json(JSON.parse(data));
});

app.post("/api/reviews", (req, res) => {
  const reviews = JSON.parse(fs.readFileSync("data/reviews.json"));
  reviews.push(req.body);
  fs.writeFileSync("data/reviews.json", JSON.stringify(reviews, null, 2));
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log("Serveur PokéTerps lancé sur le port", PORT);
});
