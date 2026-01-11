const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.BOT_TOKEN;

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== BOT =====
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Bienvenue dans le PokéTerps 🧬", {
    reply_markup: {
      keyboard: [
        ["📘 Pokédex"],
        ["⭐ Reviews"],
        ["❤️ Soutenir"]
        ["admin"]
      ],
      resize_keyboard: true
    }
  });
});

bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  if (msg.text === "📘 Pokédex") {
    bot.sendMessage(chatId, "Ouvre le Pokédex 👇\nhttps://poketerps.onrender.com");
  }

  if (msg.text === "⭐ Reviews") {
    bot.sendMessage(chatId, "Avis clients ⭐\nhttps://poketerps.onrender.com/reviews.html");
  }
  if (msg.text === "⭐ Reviews") {
    bot.sendMessage(chatId, "Avis clients ⭐\nhttps://poketerps.onrender.com/admin.html");
  }
});

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
  console.log("Serveur PokéTerps lancé");
});
