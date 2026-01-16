const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());

// ✅ Sert les fichiers du dossier public
app.use(express.static(path.join(__dirname, "public")));

// ✅ Fix "Cannot GET /"
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;

// ⚠️ IMPORTANT: ton token a été exposé -> régénère-le sur @BotFather si possible
const TOKEN = "8549074065:AAGlqwKJRSmpnQsdZkPgVeGkC8jpW4x9zv0";

const bot = new TelegramBot(TOKEN, { polling: true });

/* ================== ADMIN CONFIG ================== */
const ADMIN_IDS = new Set([
  6675436692 // ✅ TON ID ADMIN
]);

function isAdmin(chatId) {
  return ADMIN_IDS.has(chatId);
}

/* ================== CARDS STORAGE ================== */
const CARDS_PATH = path.join(__dirname, "data", "cards.json");

function readCards() {
  try {
    const raw = fs.readFileSync(CARDS_PATH, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function writeCards(cards) {
  fs.writeFileSync(CARDS_PATH, JSON.stringify(cards, null, 2), "utf-8");
}

function toArrayFromCsv(str) {
  if (!str) return [];
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function nextId(cards) {
  const max = cards.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0);
  return max + 1;
}

/* ================== API POUR LA MINI-APP ================== */
app.get("/api/cards", (req, res) => {
  res.json(readCards());
});

/* ================= MENU /START ================= */
function sendStartMenu(chatId) {
  bot
    .sendPhoto(chatId, "https://picsum.photos/900/500", {
      caption: "🧬 *Bienvenue dans PokéTerps*",
      parse_mode: "Markdown",
    })
    .then(() => {
      bot.sendMessage(chatId, "Choisis une section 👇", {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📘 Pokédex",
                web_app: { url: "https://poketerps.onrender.com" },
              },
            ],
            [{ text: "ℹ️ Informations", callback_data: "info" }],
            [{ text: "⭐ Reviews", callback_data: "reviews" }],
            [{ text: "❤️ Soutenir", url: "https://t.me/TON_LIEN" }],
          ],
        },
      });
    });
}

bot.onText(/\/start/, (msg) => {
  sendStartMenu(msg.chat.id);
});

/* ================= CALLBACK BUTTONS ================= */
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
      reply_markup: {
        inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "back" }]],
      },
    });
  }

  if (query.data === "back") {
    sendStartMenu(chatId);
  }

  if (query.data === "reviews") {
    bot.sendMessage(chatId, "⭐ Reviews en préparation...");
  }
});

/* ================== ADMIN COMMANDS ================== */

// /myid => te donne ton chat id (utile pour debug)
bot.onText(/^\/myid$/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `Ton chat_id = ${chatId}`);
});

// /adminhelp => aide admin
bot.onText(/^\/adminhelp$/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  bot.sendMessage(
    chatId,
    "👑 *Commandes Admin PokéTerps*\n\n" +
      "✅ /list [hash|weed|extraction|wpff]\n" +
      "✅ /add name|type|thc|desc|terpenes,a,b|aroma,a,b|effects,a,b|advice|imgurl\n" +
      "✅ /edit id field value\n" +
      "✅ /del id\n\n" +
      "*Champs edit:* name,type,thc,desc,img,advice,terpenes,aroma,effects\n" +
      "*Types:* hash, weed, extraction, wpff",
    { parse_mode: "Markdown" }
  );
});

/**
 * /add name|type|thc|desc|terpenes,a,b|aroma,a,b|effects,a,b|advice|imgurl
 */
bot.onText(/^\/add\s+(.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  const payload = match[1];
  const parts = payload.split("|").map((x) => x.trim());

  // 9 champs minimum
  if (parts.length < 9) {
    return bot.sendMessage(
      chatId,
      "❌ Format /add incorrect.\n\n" +
        "✅ Exemple:\n" +
        "/add Static Hash|hash|THC: 35–55%|Hash sec parfumé|Myrcene,Caryophyllene|Terreux,Épicé|Relax,Calme|Commence bas|https://i.imgur.com/0HqWQvH.png"
    );
  }

  const [name, type, thc, desc, terpenesCsv, aromaCsv, effectsCsv, advice, img] = parts;

  const allowedTypes = new Set(["hash", "weed", "extraction", "wpff"]);
  if (!allowedTypes.has(type)) {
    return bot.sendMessage(chatId, "❌ type invalide. Utilise: hash | weed | extraction | wpff");
  }

  const cards = readCards();

  const card = {
    id: nextId(cards),
    name,
    type,
    thc,
    desc,
    img,
    terpenes: toArrayFromCsv(terpenesCsv),
    aroma: toArrayFromCsv(aromaCsv),
    effects: toArrayFromCsv(effectsCsv),
    advice,
  };

  cards.push(card);
  writeCards(cards);

  bot.sendMessage(chatId, `✅ Ajouté (#${card.id}) ${card.name}\nCatégorie: ${card.type}`);
});

/**
 * /list [type]
 */
bot.onText(/^\/list(?:\s+(\w+))?$/, (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  const filter = (match[1] || "").toLowerCase();
  const cards = readCards();

  const filtered = filter ? cards.filter((c) => c.type === filter) : cards;
  if (!filtered.length) return bot.sendMessage(chatId, "Aucune fiche.");

  const lines = filtered
    .slice(0, 80)
    .map((c) => `#${c.id} • ${c.type} • ${c.name}`)
    .join("\n");

  bot.sendMessage(chatId, `📚 Fiches (${filtered.length})\n\n${lines}`);
});

/**
 * /del id
 */
bot.onText(/^\/del\s+(\d+)$/, (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  const id = Number(match[1]);
  const cards = readCards();
  const before = cards.length;
  const afterCards = cards.filter((c) => Number(c.id) !== id);

  if (afterCards.length === before) return bot.sendMessage(chatId, "❌ ID introuvable.");

  writeCards(afterCards);
  bot.sendMessage(chatId, `🗑️ Supprimé: #${id}`);
});

/**
 * /edit id field value
 * fields: name,type,thc,desc,img,advice,terpenes,aroma,effects
 */
bot.onText(/^\/edit\s+(\d+)\s+(\w+)\s+([\s\S]+)$/m, (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  const id = Number(match[1]);
  const field = match[2].toLowerCase();
  const value = (match[3] || "").trim();

  const cards = readCards();
  const card = cards.find((c) => Number(c.id) === id);
  if (!card) return bot.sendMessage(chatId, "❌ ID introuvable.");

  const allowedFields = new Set([
    "name",
    "type",
    "thc",
    "desc",
    "img",
    "advice",
    "terpenes",
    "aroma",
    "effects",
  ]);
  if (!allowedFields.has(field)) {
    return bot.sendMessage(
      chatId,
      "❌ Champ invalide. Champs: name,type,thc,desc,img,advice,terpenes,aroma,effects"
    );
  }

  if (field === "type") {
    const allowedTypes = new Set(["hash", "weed", "extraction", "wpff"]);
    if (!allowedTypes.has(value)) return bot.sendMessage(chatId, "❌ type invalide: hash|weed|extraction|wpff");
    card.type = value;
  } else if (["terpenes", "aroma", "effects"].includes(field)) {
    card[field] = toArrayFromCsv(value);
  } else {
    card[field] = value;
  }

  writeCards(cards);
  bot.sendMessage(chatId, `✅ Modifié #${id} → ${field} mis à jour.`);
});

app.listen(PORT, () => console.log("Serveur PokéTerps lancé sur le port", PORT));
