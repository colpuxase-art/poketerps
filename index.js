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

/* ================== ADD FORM (WIZARD) ================== */
// état du formulaire par chatId
const addWizard = new Map();
// structure: { step, data: {name,type,thc,desc,terpenes,aroma,effects,advice,img} }

function wizardCancel(chatId) {
  addWizard.delete(chatId);
  bot.sendMessage(chatId, "❌ Ajout annulé.");
}

function wizardAskType(chatId) {
  bot.sendMessage(chatId, "2/9 — Choisis la *catégorie* :", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Hash", callback_data: "wiz_type_hash" },
          { text: "Weed", callback_data: "wiz_type_weed" },
        ],
        [
          { text: "Extraction", callback_data: "wiz_type_extraction" },
          { text: "WPFF", callback_data: "wiz_type_wpff" },
        ],
        [{ text: "❌ Annuler", callback_data: "wiz_cancel" }],
      ],
    },
  });
}

function wizardFinish(chatId) {
  const state = addWizard.get(chatId);
  if (!state) return;

  const d = state.data;

  const cards = readCards();
  const card = {
    id: nextId(cards),
    name: d.name,
    type: d.type,
    thc: d.thc || "—",
    desc: d.desc || "—",
    img: d.img || "https://i.imgur.com/0HqWQvH.png",
    terpenes: toArrayFromCsv(d.terpenes || ""),
    aroma: toArrayFromCsv(d.aroma || ""),
    effects: toArrayFromCsv(d.effects || ""),
    advice:
      d.advice ||
      "Info éducative. Les effets varient selon la personne. Respecte la loi.",
  };

  cards.push(card);
  writeCards(cards);

  addWizard.delete(chatId);

  bot.sendMessage(
    chatId,
    "✅ *Fiche ajoutée !*\n\n" +
      `#${card.id} — *${card.name}*\n` +
      `Catégorie: *${card.type}*\n` +
      `${card.thc}\n\n` +
      `🧬 ${card.desc}\n` +
      `🌿 Terpènes: ${card.terpenes.length ? card.terpenes.join(", ") : "—"}\n` +
      `👃 Arômes: ${card.aroma.length ? card.aroma.join(", ") : "—"}\n` +
      `🧠 Effets: ${card.effects.length ? card.effects.join(", ") : "—"}\n` +
      `⚠️ ${card.advice}`,
    { parse_mode: "Markdown" }
  );
}

// /addform => lance le formulaire
bot.onText(/^\/addform$/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  addWizard.set(chatId, { step: "name", data: {} });

  bot.sendMessage(
    chatId,
    "📝 *Ajout d’une fiche* (formulaire)\n\n" +
      "1/9 — Envoie le *nom* de la fiche.\n" +
      "Ex: `Static Hash Premium`",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Annuler", callback_data: "wiz_cancel" }]],
      },
    }
  );
});

/* ================== EDIT FORM (WIZARD) ================== */
const editWizard = new Map();
// structure: { step: "value", id, field }

function editCancel(chatId) {
  editWizard.delete(chatId);
  bot.sendMessage(chatId, "❌ Modification annulée.");
}

bot.onText(/^\/editform$/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  const cards = readCards();
  if (!cards.length) return bot.sendMessage(chatId, "Aucune fiche à modifier.");

  const buttons = cards.slice(0, 30).map((c) => [
    { text: `#${c.id} ${c.name}`, callback_data: `edit_pick_${c.id}` },
  ]);
  buttons.push([{ text: "❌ Annuler", callback_data: "edit_cancel" }]);

  bot.sendMessage(chatId, "🛠️ Choisis la fiche à modifier :", {
    reply_markup: { inline_keyboard: buttons },
  });
});

/* ================= CALLBACK BUTTONS (INFO/REVIEWS + WIZARDS) ================= */
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;

  // on répond au callback pour enlever le loading
  bot.answerCallbackQuery(query.id);

  // ---- Wizard callbacks (addform) ----
  if (isAdmin(chatId)) {
    if (query.data === "wiz_cancel") {
      wizardCancel(chatId);
      return;
    }

    if (query.data && query.data.startsWith("wiz_type_")) {
      const state = addWizard.get(chatId);
      if (!state) return;

      const t = query.data.replace("wiz_type_", "");
      const allowed = new Set(["hash", "weed", "extraction", "wpff"]);
      if (!allowed.has(t)) return;

      state.data.type = t;
      state.step = "thc";
      addWizard.set(chatId, state);

      bot.sendMessage(
        chatId,
        "3/9 — Envoie le *THC* (ex: `THC: 35–55%` ou `THC: ~70%`).",
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{ text: "❌ Annuler", callback_data: "wiz_cancel" }]],
          },
        }
      );
      return;
    }
  }

  // ---- Wizard callbacks (editform) ----
  if (isAdmin(chatId)) {
    if (query.data === "edit_cancel") {
      editCancel(chatId);
      return;
    }

    if (query.data && query.data.startsWith("edit_pick_")) {
      const id = Number(query.data.replace("edit_pick_", ""));
      const cards = readCards();
      const card = cards.find((c) => Number(c.id) === id);
      if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");

      bot.sendMessage(chatId, `✅ Fiche sélectionnée: #${id}\nChoisis le champ :`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Nom", callback_data: `edit_field_${id}_name` }, { text: "Type", callback_data: `edit_field_${id}_type` }],
            [{ text: "THC", callback_data: `edit_field_${id}_thc` }, { text: "Description", callback_data: `edit_field_${id}_desc` }],
            [{ text: "Terpènes", callback_data: `edit_field_${id}_terpenes` }, { text: "Arômes", callback_data: `edit_field_${id}_aroma` }],
            [{ text: "Effets", callback_data: `edit_field_${id}_effects` }, { text: "Conseils", callback_data: `edit_field_${id}_advice` }],
            [{ text: "Image", callback_data: `edit_field_${id}_img` }],
            [{ text: "❌ Annuler", callback_data: "edit_cancel" }]
          ]
        }
      });
      return;
    }

    if (query.data && query.data.startsWith("edit_field_")) {
      // format: edit_field_{id}_{field}
      const parts = query.data.split("_");
      // ["edit","field","{id}","{field}"]
      const id = Number(parts[2]);
      const field = parts.slice(3).join("_");

      const allowedFields = new Set(["name","type","thc","desc","img","advice","terpenes","aroma","effects"]);
      if (!allowedFields.has(field)) return bot.sendMessage(chatId, "❌ Champ invalide.");

      // type: on propose des boutons
      if (field === "type") {
        bot.sendMessage(chatId, `🔁 Nouveau type pour #${id} :`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Hash", callback_data: `edit_type_${id}_hash` }, { text: "Weed", callback_data: `edit_type_${id}_weed` }],
              [{ text: "Extraction", callback_data: `edit_type_${id}_extraction` }, { text: "WPFF", callback_data: `edit_type_${id}_wpff` }],
              [{ text: "❌ Annuler", callback_data: "edit_cancel" }]
            ]
          }
        });
        return;
      }

      // sinon: on attend un message texte
      editWizard.set(chatId, { step: "value", id, field });

      bot.sendMessage(
        chatId,
        `✍️ Envoie la nouvelle valeur pour *${field}* (ou \`-\` pour vider).\n` +
          (["terpenes", "aroma", "effects"].includes(field)
            ? "Format: `a,b,c` (virgules)"
            : ""),
        {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "edit_cancel" }]] }
        }
      );
      return;
    }

    if (query.data && query.data.startsWith("edit_type_")) {
      // format: edit_type_{id}_{newType}
      const parts = query.data.split("_");
      const id = Number(parts[2]);
      const newType = parts[3];

      const allowedTypes = new Set(["hash", "weed", "extraction", "wpff"]);
      if (!allowedTypes.has(newType)) return bot.sendMessage(chatId, "❌ Type invalide.");

      const cards = readCards();
      const card = cards.find((c) => Number(c.id) === id);
      if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");

      card.type = newType;
      writeCards(cards);

      bot.sendMessage(chatId, `✅ Type mis à jour: #${id} → ${newType}`);
      return;
    }
  }

  // ---- Ton système info/back/reviews ----
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
      "✅ /addform  *(formulaire ajout)*\n" +
      "✅ /editform *(formulaire modification)*\n" +
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
    if (!allowedTypes.has(value))
      return bot.sendMessage(chatId, "❌ type invalide: hash|weed|extraction|wpff");
    card.type = value;
  } else if (["terpenes", "aroma", "effects"].includes(field)) {
    card[field] = toArrayFromCsv(value);
  } else {
    card[field] = value;
  }

  writeCards(cards);
  bot.sendMessage(chatId, `✅ Modifié #${id} → ${field} mis à jour.`);
});

/* ================= messages texte du wizard (ADD + EDIT) ================= */
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  if (!isAdmin(chatId)) return;

  // ne pas capturer les commandes (/start etc.)
  if (text.startsWith("/")) return;

  /* ===== ADD WIZARD ===== */
  const addState = addWizard.get(chatId);
  if (addState) {
    if (addState.step === "name") {
      addState.data.name = text;
      addState.step = "type";
      addWizard.set(chatId, addState);
      wizardAskType(chatId);
      return;
    }

    if (addState.step === "thc") {
      addState.data.thc = text;
      addState.step = "desc";
      addWizard.set(chatId, addState);
      bot.sendMessage(chatId, "4/9 — Envoie la *description/profil*.", {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "❌ Annuler", callback_data: "wiz_cancel" }]],
        },
      });
      return;
    }

    if (addState.step === "desc") {
      addState.data.desc = text;
      addState.step = "terpenes";
      addWizard.set(chatId, addState);
      bot.sendMessage(
        chatId,
        "5/9 — Envoie les *terpènes* (virgules).\nEx: `Myrcene,Caryophyllene` (ou `-`)",
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{ text: "❌ Annuler", callback_data: "wiz_cancel" }]],
          },
        }
      );
      return;
    }

    if (addState.step === "terpenes") {
      addState.data.terpenes = text === "-" ? "" : text;
      addState.step = "aroma";
      addWizard.set(chatId, addState);
      bot.sendMessage(
        chatId,
        "6/9 — Envoie les *arômes* (virgules).\nEx: `Terreux,Épicé,Boisé` (ou `-`)",
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{ text: "❌ Annuler", callback_data: "wiz_cancel" }]],
          },
        }
      );
      return;
    }

    if (addState.step === "aroma") {
      addState.data.aroma = text === "-" ? "" : text;
      addState.step = "effects";
      addWizard.set(chatId, addState);
      bot.sendMessage(
        chatId,
        "7/9 — Envoie les *effets (ressenti)* (virgules).\nEx: `Relax,Calme` (ou `-`)",
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{ text: "❌ Annuler", callback_data: "wiz_cancel" }]],
          },
        }
      );
      return;
    }

    if (addState.step === "effects") {
      addState.data.effects = text === "-" ? "" : text;
      addState.step = "advice";
      addWizard.set(chatId, addState);
      bot.sendMessage(
        chatId,
        "8/9 — Envoie les *conseils / warning*.\nEx: `Commence bas. Ne mélange pas.`",
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{ text: "❌ Annuler", callback_data: "wiz_cancel" }]],
          },
        }
      );
      return;
    }

    if (addState.step === "advice") {
      addState.data.advice = text;
      addState.step = "img";
      addWizard.set(chatId, addState);
      bot.sendMessage(
        chatId,
        "9/9 — Envoie l’*URL de l’image*.\nEx: `https://...png` (ou `-`)",
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{ text: "❌ Annuler", callback_data: "wiz_cancel" }]],
          },
        }
      );
      return;
    }

    if (addState.step === "img") {
      addState.data.img = text === "-" ? "" : text;
      addWizard.set(chatId, addState);
      wizardFinish(chatId);
      return;
    }
  }

  /* ===== EDIT WIZARD ===== */
  const editState = editWizard.get(chatId);
  if (editState && editState.step === "value") {
    const cards = readCards();
    const card = cards.find((c) => Number(c.id) === Number(editState.id));
    if (!card) {
      editWizard.delete(chatId);
      bot.sendMessage(chatId, "❌ Fiche introuvable.");
      return;
    }

    const field = editState.field;
    const val = text === "-" ? "" : text;

    if (["terpenes", "aroma", "effects"].includes(field)) {
      card[field] = val ? toArrayFromCsv(val) : [];
    } else {
      card[field] = val;
    }

    writeCards(cards);
    editWizard.delete(chatId);
    bot.sendMessage(chatId, `✅ Modifié #${card.id} → ${field} mis à jour.`);
    return;
  }
});

app.listen(PORT, () => console.log("Serveur PokéTerps lancé sur le port", PORT));
