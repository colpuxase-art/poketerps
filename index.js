const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// 🔴 REMPLACE PAR TON TOKEN
const TOKEN = "8549074065:AAF1WtGvuC-d6KJClSmPSyLt2wokCOVhyTs";

// 🔴 REMPLACE PAR TON ID TELEGRAM
const ADMIN_ID = 93372553;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

/* =======================
   BOT TELEGRAM
======================= */

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "🧬 Bienvenue sur PokéTerps", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "📘 Ouvrir Pokédex",
            web_app: {
              url: "https://poketerps.onrender.com"
            }
          }
        ],
        [
          {
            text: "⭐ Reviews",
            web_app: {
              url: "https://poketerps.onrender.com"
            }
          }
        ]
      ]
    }
  });
});

bot.onText(/\/admin/, (msg) => {
  if (msg.from.id !== ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, "⛔ Accès refusé");
  }

  bot.sendMessage(msg.chat.id, "🛠️ Admin PokéTerps", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "⚙️ Ouvrir Admin",
            web_app: {
              url: "https://poketerps.onrender.com/admin.html"
            }
          }
        ]
      ]
    }
  });
});

/* =======================
   API POKÉMON
======================= */

// Lire les pokémon (PUBLIC)
app.get("/api/pokemons", (req, res) => {
  const data = fs.readFileSync("data/pokemons.json");
  res.json(JSON.parse(data));
});

// Ajouter pokémon (ADMIN ONLY)
app.post("/api/pokemons", (req, res) => {
  const telegramId = Number(req.headers["x-telegram-id"]);

  if (telegramId !== ADMIN_ID) {
    return res.status(403).json({ error: "Accès refusé" });
  }

  const pokemons = JSON.parse(fs.readFileSync("data/pokemons.json"));
  pokemons.push(req.body);

  fs.writeFileSync("data/pokemons.json", JSON.stringify(pokemons, null, 2));
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log("🔥 PokéTerps lancé");
});
