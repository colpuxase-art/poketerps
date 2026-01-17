const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

// ✅ Sert les fichiers du dossier public
app.use(express.static(path.join(__dirname, "public")));

// ✅ Fix "Cannot GET /"
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;

/* ================== ENV ================== */
const TOKEN =
  process.env.BOT_TOKEN || "8549074065:AAGlqwKJRSmpnQsdZkPgVeGkC8jpW4x9zv0"; // token test OK

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

const supabaseReady = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE);

if (!supabaseReady) {
  console.error(
    "❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE manquant (Render -> Environment)."
  );
}

const sb = supabaseReady
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false },
    })
  : null;

const bot = new TelegramBot(TOKEN, { polling: true });

/* ================== ADMIN CONFIG ================== */
const ADMIN_IDS = new Set([6675436692]); // ✅ TON ID ADMIN
const isAdmin = (chatId) => ADMIN_IDS.has(chatId);

const allowedTypes = new Set(["hash", "weed", "extraction", "wpff"]);
const micronValues = ["120u", "90u", "73u", "45u"];
const isMicron = (v) => micronValues.includes(String(v || "").toLowerCase());

const csvToArr = (str) =>
  (str || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/* ================== DB HELPERS (Supabase) ================== */
function assertSupabase() {
  if (!sb) {
    throw new Error(
      "Supabase non configuré. Ajoute SUPABASE_URL et SUPABASE_SERVICE_ROLE dans Render (Environment)."
    );
  }
}

async function dbListCards() {
  assertSupabase();
  const { data, error } = await sb
    .from("cards")
    .select("*")
    .order("id", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function dbGetCard(id) {
  assertSupabase();
  const { data, error } = await sb
    .from("cards")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function dbInsertCard(payload) {
  assertSupabase();
  const { data, error } = await sb
    .from("cards")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function dbInsertMany(rows) {
  assertSupabase();
  const { data, error } = await sb.from("cards").insert(rows).select("*");
  if (error) throw error;
  return data || [];
}

async function dbUpdateCard(id, patch) {
  assertSupabase();
  const { data, error } = await sb
    .from("cards")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function dbDeleteCard(id) {
  assertSupabase();
  const { error } = await sb.from("cards").delete().eq("id", id);
  if (error) throw error;
}

/* ================== API POUR LA MINI-APP ================== */
app.get("/api/cards", async (req, res) => {
  // ✅ si supabase pas prêt, on renvoie une liste vide
  if (!supabaseReady) return res.json([]);

  try {
    const cards = await dbListCards();

    // compat: mini-app attend parfois "desc"
    const mapped = cards.map((c) => ({
      ...c,
      desc: c.description ?? c.desc ?? "—",
    }));

    res.json(mapped);
  } catch (e) {
    console.error("❌ /api/cards:", e.message);
    res.status(500).json({ error: e.message || "db_error" });
  }
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
    })
    .catch(() => {
      bot.sendMessage(chatId, "🧬 Bienvenue dans PokéTerps\n\nChoisis une section 👇", {
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

bot.onText(/\/start/, (msg) => sendStartMenu(msg.chat.id));

/* ================== ADMIN COMMANDS ================== */
bot.onText(/^\/myid$/, (msg) =>
  bot.sendMessage(msg.chat.id, `Ton chat_id = ${msg.chat.id}`)
);

bot.onText(/^\/dbtest$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return;

  try {
    assertSupabase();
    const { data, error } = await sb.from("cards").select("id").limit(1);
    if (error) throw error;
    bot.sendMessage(chatId, `✅ Supabase OK (table cards accessible)`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ Supabase KO: ${e.message}`);
  }
});

/* ================== SEED ================== */
bot.onText(/^\/seed$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const existing = await dbListCards();
    if (existing.length) {
      return bot.sendMessage(
        chatId,
        `⚠️ Il y a déjà ${existing.length} fiche(s). Je ne seed pas pour éviter les doublons.`
      );
    }

    const rows = [
      {
        name: "Bubble Hash 120u (exemple)",
        type: "hash",
        micron: "120u",
        thc: "THC: 35–50% (exemple)",
        description:
          "Coupe 120u : souvent plus “large”, plus végétal selon le matos. Profil éducatif.",
        img: "https://i.imgur.com/0HqWQvH.png",
        terpenes: ["Myrcene", "Caryophyllene"],
        aroma: ["Terreux", "Épicé"],
        effects: ["Relax (ressenti)"],
        advice: "Commence bas. Attends. Hydrate-toi. Respecte la loi.",
      },
      {
        name: "Bubble Hash 90u (exemple)",
        type: "hash",
        micron: "90u",
        thc: "THC: 40–55% (exemple)",
        description: "Coupe 90u : souvent plus “propre”/aromatique. Profil éducatif.",
        img: "https://i.imgur.com/0HqWQvH.png",
        terpenes: ["Limonene", "Caryophyllene"],
        aroma: ["Agrumes", "Épicé"],
        effects: ["Bonne humeur (ressenti)"],
        advice: "Info éducative. Les effets varient selon la personne.",
      },
      {
        name: "Bubble Hash 73u (exemple)",
        type: "hash",
        micron: "73u",
        thc: "THC: 45–60% (exemple)",
        description:
          "Coupe 73u : très recherchée en général (souvent “sweet spot”). Profil éducatif.",
        img: "https://i.imgur.com/0HqWQvH.png",
        terpenes: ["Pinene", "Myrcene"],
        aroma: ["Pin", "Herbacé"],
        effects: ["Calme (ressenti)"],
        advice: "Évite de conduire. Ne mélange pas. Respecte les lois.",
      },
      {
        name: "Bubble Hash 45u (exemple)",
        type: "hash",
        micron: "45u",
        thc: "THC: 30–45% (exemple)",
        description: "Coupe 45u : plus fine, parfois plus légère. Profil éducatif.",
        img: "https://i.imgur.com/0HqWQvH.png",
        terpenes: ["Humulene", "Myrcene"],
        aroma: ["Boisé", "Terreux"],
        effects: ["Relax (ressenti)"],
        advice: "Commence bas. Attends 10–15 minutes avant de reprendre.",
      },
      {
        name: "Static Hash (exemple)",
        type: "hash",
        micron: null,
        thc: "THC: 35–55% (exemple)",
        description: "Hash sec, texture sableuse, très parfumé.",
        img: "https://i.imgur.com/0HqWQvH.png",
        terpenes: ["Myrcene", "Caryophyllene"],
        aroma: ["Terreux", "Épicé", "Boisé"],
        effects: ["Relax (ressenti)", "Calme (ressenti)"],
        advice: "Commence bas. Évite de mélanger. Respecte la législation.",
      },
    ];

    const inserted = await dbInsertMany(rows);
    bot.sendMessage(
      chatId,
      `✅ Seed OK: ${inserted.length} fiche(s) ajoutée(s). Teste /editform maintenant.`
    );
  } catch (e) {
    bot.sendMessage(chatId, `❌ Seed KO: ${e.message}`);
  }
});

bot.onText(/^\/adminhelp$/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  bot.sendMessage(
    chatId,
    "👑 *Commandes Admin PokéTerps*\n\n" +
      "✅ /dbtest *(test Supabase)*\n" +
      "✅ /seed *(ajoute des fiches de base)*\n\n" +
      "✅ /list [hash|weed|extraction|wpff|120u|90u|73u|45u]\n" +
      "✅ /addform *(formulaire ajout + microns)*\n" +
      "✅ /editform *(formulaire modification + microns)*\n" +
      "✅ /delform *(suppression avec boutons)*\n" +
      "✅ /edit id field value *(field: description,micron,...)*\n" +
      "✅ /del id\n",
    { parse_mode: "Markdown" }
  );
});

bot.onText(/^\/list(?:\s+(\w+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const filter = (match[1] || "").toLowerCase();

    let cards = await dbListCards();
    if (filter) {
      if (isMicron(filter)) {
        cards = cards.filter(
          (c) => String(c.micron || "").toLowerCase() === filter
        );
      } else {
        cards = cards.filter((c) => String(c.type || "").toLowerCase() === filter);
      }
    }

    if (!cards.length) return bot.sendMessage(chatId, "Aucune fiche.");

    const lines = cards
      .slice(0, 80)
      .map(
        (c) => `#${c.id} • ${c.type}${c.micron ? " • " + c.micron : ""} • ${c.name}`
      )
      .join("\n");

    bot.sendMessage(chatId, `📚 Fiches (${cards.length})\n\n${lines}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /list: ${e.message}`);
  }
});

bot.onText(/^\/del\s+(\d+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const id = Number(match[1]);
    const card = await dbGetCard(id);
    if (!card) return bot.sendMessage(chatId, "❌ ID introuvable.");

    await dbDeleteCard(id);
    bot.sendMessage(chatId, `🗑️ Supprimé: #${id}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /del: ${e.message}`);
  }
});

bot.onText(/^\/edit\s+(\d+)\s+(\w+)\s+([\s\S]+)$/m, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const id = Number(match[1]);
    const field = match[2].toLowerCase();
    const value = (match[3] || "").trim();

    const allowedFields = new Set([
      "name",
      "type",
      "micron",
      "thc",
      "description",
      "img",
      "advice",
      "terpenes",
      "aroma",
      "effects",
    ]);
    if (!allowedFields.has(field)) return bot.sendMessage(chatId, "❌ Champ invalide.");

    const card = await dbGetCard(id);
    if (!card) return bot.sendMessage(chatId, "❌ ID introuvable.");

    const patch = {};
    if (field === "type") {
      if (!allowedTypes.has(value))
        return bot.sendMessage(chatId, "❌ type invalide: hash|weed|extraction|wpff");
      patch.type = value;
    } else if (field === "micron") {
      const v = value === "-" ? null : value;
      if (v && !isMicron(v))
        return bot.sendMessage(chatId, "❌ micron invalide: 120u|90u|73u|45u (ou `-`)");
      patch.micron = v;
    } else if (["terpenes", "aroma", "effects"].includes(field)) {
      patch[field] = csvToArr(value);
    } else {
      patch[field] = value === "-" ? "" : value;
    }

    await dbUpdateCard(id, patch);
    bot.sendMessage(chatId, `✅ Modifié #${id} → ${field} mis à jour.`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /edit: ${e.message}`);
  }
});

/* ================== FORMS (WIZARDS) ================== */
const addWizard = new Map();
const editWizard = new Map();
const delWizard = new Map();

function wizardCancel(chatId) {
  addWizard.delete(chatId);
  bot.sendMessage(chatId, "❌ Ajout annulé.");
}

function wizardAskType(chatId) {
  bot.sendMessage(chatId, "2/10 — Choisis la *catégorie* :", {
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

function wizardAskMicron(chatId) {
  bot.sendMessage(chatId, "3/10 — Choisis le *micron* :", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "120u", callback_data: "wiz_micron_120u" },
          { text: "90u", callback_data: "wiz_micron_90u" },
        ],
        [
          { text: "73u", callback_data: "wiz_micron_73u" },
          { text: "45u", callback_data: "wiz_micron_45u" },
        ],
        [{ text: "Aucun", callback_data: "wiz_micron_none" }],
        [{ text: "❌ Annuler", callback_data: "wiz_cancel" }],
      ],
    },
  });
}

async function wizardFinish(chatId) {
  const state = addWizard.get(chatId);
  if (!state) return;
  const d = state.data;

  const card = await dbInsertCard({
    name: d.name,
    type: d.type,
    micron: d.micron || null,
    thc: d.thc || "—",
    description: d.description || "—",
    img: d.img || "https://i.imgur.com/0HqWQvH.png",
    terpenes: csvToArr(d.terpenes || ""),
    aroma: csvToArr(d.aroma || ""),
    effects: csvToArr(d.effects || ""),
    advice:
      d.advice ||
      "Info éducative. Les effets varient selon la personne. Respecte la loi.",
  });

  addWizard.delete(chatId);

  const micronTxt = card.micron ? ` • ${card.micron}` : "";
  bot.sendMessage(
    chatId,
    "✅ *Fiche ajoutée !*\n\n" +
      `#${card.id} — *${card.name}*\n` +
      `Catégorie: *${card.type}${micronTxt}*\n` +
      `${card.thc}\n\n` +
      `🧬 ${card.description}\n` +
      `🌿 Terpènes: ${card.terpenes?.length ? card.terpenes.join(", ") : "—"}\n` +
      `👃 Arômes: ${card.aroma?.length ? card.aroma.join(", ") : "—"}\n` +
      `🧠 Effets: ${card.effects?.length ? card.effects.join(", ") : "—"}\n` +
      `⚠️ ${card.advice}`,
    { parse_mode: "Markdown" }
  );
}

bot.onText(/^\/addform$/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  addWizard.set(chatId, { step: "name", data: {} });

  bot.sendMessage(
    chatId,
    "📝 *Ajout d’une fiche* (formulaire)\n\n" +
      "1/10 — Envoie le *nom* de la fiche.\n" +
      "Ex: `Static Hash Premium`",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Annuler", callback_data: "wiz_cancel" }]],
      },
    }
  );
});

bot.onText(/^\/editform$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const cards = await dbListCards();
    if (!cards.length)
      return bot.sendMessage(chatId, "Aucune fiche à modifier. (Utilise /seed ou /addform)");

    const buttons = cards.slice(0, 30).map((c) => [
      { text: `#${c.id} ${c.name}`, callback_data: `edit_pick_${c.id}` },
    ]);
    buttons.push([{ text: "❌ Annuler", callback_data: "edit_cancel" }]);

    bot.sendMessage(chatId, "🛠️ Choisis la fiche à modifier :", {
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (e) {
    bot.sendMessage(chatId, `❌ /editform: ${e.message}`);
  }
});

bot.onText(/^\/delform$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const cards = await dbListCards();
    if (!cards.length) return bot.sendMessage(chatId, "Aucune fiche à supprimer.");

    const buttons = cards.slice(0, 30).map((c) => [
      { text: `🗑️ #${c.id} ${c.name}`, callback_data: `del_pick_${c.id}` },
    ]);
    buttons.push([{ text: "❌ Annuler", callback_data: "del_cancel" }]);

    bot.sendMessage(chatId, "🗑️ Choisis la fiche à supprimer :", {
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (e) {
    bot.sendMessage(chatId, `❌ /delform: ${e.message}`);
  }
});

/* ================= CALLBACK QUERY ================= */
bot.on("callback_query", async (query) => {
  const chatId = query.message?.chat?.id;
  try {
    await bot.answerCallbackQuery(query.id);
  } catch {}

  if (!chatId) return;

  // info / back / reviews
  if (query.data === "info") {
    return bot.sendPhoto(chatId, "https://picsum.photos/900/501", {
      caption:
        "ℹ️ *Informations PokéTerps*\n\n" +
        "🌿 Projet éducatif sur le THC & les terpènes\n" +
        "🧬 Fiches: hash / weed / extraction / wpff + microns\n\n" +
        "_Aucune vente – information uniquement_",
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "back" }]] },
    });
  }
  if (query.data === "back") return sendStartMenu(chatId);
  if (query.data === "reviews") return bot.sendMessage(chatId, "⭐ Reviews en préparation...");

  // addform callbacks
  if (isAdmin(chatId)) {
    if (query.data === "wiz_cancel") return wizardCancel(chatId);

    if (query.data?.startsWith("wiz_type_")) {
      const state = addWizard.get(chatId);
      if (!state) return;

      const t = query.data.replace("wiz_type_", "");
      if (!allowedTypes.has(t)) return;

      state.data.type = t;
      state.step = "micron";
      addWizard.set(chatId, state);
      return wizardAskMicron(chatId);
    }

    if (query.data?.startsWith("wiz_micron_")) {
      const state = addWizard.get(chatId);
      if (!state) return;

      const m = query.data.replace("wiz_micron_", "");
      state.data.micron = m === "none" ? "" : m;
      state.step = "thc";
      addWizard.set(chatId, state);

      return bot.sendMessage(chatId, "4/10 — Envoie le *THC* (ex: `THC: 35–55%`).", {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "wiz_cancel" }]] },
      });
    }
  }

  if (!isAdmin(chatId)) return;

  // cancel edit/del
  if (query.data === "edit_cancel") {
    editWizard.delete(chatId);
    return bot.sendMessage(chatId, "❌ Modification annulée.");
  }
  if (query.data === "del_cancel") {
    delWizard.delete(chatId);
    return bot.sendMessage(chatId, "❌ Suppression annulée.");
  }

  // del pick / confirm
  if (query.data?.startsWith("del_pick_")) {
    try {
      const id = Number(query.data.replace("del_pick_", ""));
      const card = await dbGetCard(id);
      if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");

      delWizard.set(chatId, { id, step: "confirm" });

      return bot.sendMessage(
        chatId,
        `⚠️ Confirme la suppression :\n\n#${card.id} — ${card.name}\n(${card.type}${
          card.micron ? " • " + card.micron : ""
        })`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ CONFIRMER", callback_data: `del_confirm_${id}` }],
              [{ text: "❌ Annuler", callback_data: "del_cancel" }],
            ],
          },
        }
      );
    } catch (e) {
      return bot.sendMessage(chatId, `❌ Suppression: ${e.message}`);
    }
  }

  if (query.data?.startsWith("del_confirm_")) {
    try {
      const id = Number(query.data.replace("del_confirm_", ""));
      const st = delWizard.get(chatId);
      if (!st || st.id !== id) return bot.sendMessage(chatId, "❌ Relance /delform.");

      await dbDeleteCard(id);
      delWizard.delete(chatId);
      return bot.sendMessage(chatId, `🗑️ Supprimé: #${id}`);
    } catch (e) {
      return bot.sendMessage(chatId, `❌ del_confirm: ${e.message}`);
    }
  }

  // edit pick
  if (query.data?.startsWith("edit_pick_")) {
    try {
      const id = Number(query.data.replace("edit_pick_", ""));
      const card = await dbGetCard(id);
      if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");

      return bot.sendMessage(chatId, `✅ Fiche sélectionnée: #${id}\nChoisis le champ :`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Nom", callback_data: `edit_field_${id}_name` },
              { text: "Type", callback_data: `edit_field_${id}_type` },
            ],
            [
              { text: "Micron", callback_data: `edit_field_${id}_micron` },
              { text: "THC", callback_data: `edit_field_${id}_thc` },
            ],
            [
              { text: "Description", callback_data: `edit_field_${id}_description` },
              { text: "Image", callback_data: `edit_field_${id}_img` },
            ],
            [
              { text: "Terpènes", callback_data: `edit_field_${id}_terpenes` },
              { text: "Arômes", callback_data: `edit_field_${id}_aroma` },
            ],
            [
              { text: "Effets", callback_data: `edit_field_${id}_effects` },
              { text: "Conseils", callback_data: `edit_field_${id}_advice` },
            ],
            [{ text: "❌ Annuler", callback_data: "edit_cancel" }],
          ],
        },
      });
    } catch (e) {
      return bot.sendMessage(chatId, `❌ edit_pick: ${e.message}`);
    }
  }

  // edit field
  if (query.data?.startsWith("edit_field_")) {
    const parts = query.data.split("_");
    const id = Number(parts[2]);
    const field = parts.slice(3).join("_");

    if (field === "type") {
      return bot.sendMessage(chatId, `🔁 Nouveau type pour #${id} :`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Hash", callback_data: `edit_type_${id}_hash` },
              { text: "Weed", callback_data: `edit_type_${id}_weed` },
            ],
            [
              { text: "Extraction", callback_data: `edit_type_${id}_extraction` },
              { text: "WPFF", callback_data: `edit_type_${id}_wpff` },
            ],
            [{ text: "❌ Annuler", callback_data: "edit_cancel" }],
          ],
        },
      });
    }

    if (field === "micron") {
      return bot.sendMessage(chatId, `🔁 Nouveau micron pour #${id} :`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "120u", callback_data: `edit_micron_${id}_120u` },
              { text: "90u", callback_data: `edit_micron_${id}_90u` },
            ],
            [
              { text: "73u", callback_data: `edit_micron_${id}_73u` },
              { text: "45u", callback_data: `edit_micron_${id}_45u` },
            ],
            [{ text: "Aucun", callback_data: `edit_micron_${id}_none` }],
            [{ text: "❌ Annuler", callback_data: "edit_cancel" }],
          ],
        },
      });
    }

    editWizard.set(chatId, { step: "value", id, field });

    return bot.sendMessage(
      chatId,
      `✍️ Envoie la nouvelle valeur pour *${field}* (ou \`-\` pour vider).\n` +
        (["terpenes", "aroma", "effects"].includes(field) ? "Format: `a,b,c` (virgules)" : ""),
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "edit_cancel" }]] },
      }
    );
  }

  // edit type
  if (query.data?.startsWith("edit_type_")) {
    try {
      const parts = query.data.split("_");
      const id = Number(parts[2]);
      const newType = parts[3];
      if (!allowedTypes.has(newType)) return bot.sendMessage(chatId, "❌ Type invalide.");

      await dbUpdateCard(id, { type: newType });
      return bot.sendMessage(chatId, `✅ Type mis à jour: #${id} → ${newType}`);
    } catch (e) {
      return bot.sendMessage(chatId, `❌ edit_type: ${e.message}`);
    }
  }

  // edit micron
  if (query.data?.startsWith("edit_micron_")) {
    try {
      const parts = query.data.split("_");
      const id = Number(parts[2]);
      const micron = parts[3];

      const m = micron === "none" ? null : micron;
      if (m && !isMicron(m)) return bot.sendMessage(chatId, "❌ Micron invalide.");

      await dbUpdateCard(id, { micron: m });
      return bot.sendMessage(chatId, `✅ Micron mis à jour: #${id} → ${m || "Aucun"}`);
    } catch (e) {
      return bot.sendMessage(chatId, `❌ edit_micron: ${e.message}`);
    }
  }
});

/* ================= TEXT INPUT (ADD + EDIT) ================= */
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  if (!isAdmin(chatId)) return;
  if (text.startsWith("/")) return;

  // ADD wizard
  const addState = addWizard.get(chatId);
  if (addState) {
    if (addState.step === "name") {
      addState.data.name = text;
      addState.step = "type";
      addWizard.set(chatId, addState);
      return wizardAskType(chatId);
    }

    if (addState.step === "thc") {
      addState.data.thc = text;
      addState.step = "description";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "5/10 — Envoie la *description/profil*.", { parse_mode: "Markdown" });
    }

    if (addState.step === "description") {
      addState.data.description = text;
      addState.step = "terpenes";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "6/10 — Terpènes (virgules) ou `-`", { parse_mode: "Markdown" });
    }

    if (addState.step === "terpenes") {
      addState.data.terpenes = text === "-" ? "" : text;
      addState.step = "aroma";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "7/10 — Arômes (virgules) ou `-`", { parse_mode: "Markdown" });
    }

    if (addState.step === "aroma") {
      addState.data.aroma = text === "-" ? "" : text;
      addState.step = "effects";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "8/10 — Effets (virgules) ou `-`", { parse_mode: "Markdown" });
    }

    if (addState.step === "effects") {
      addState.data.effects = text === "-" ? "" : text;
      addState.step = "advice";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "9/10 — Conseils / warning", { parse_mode: "Markdown" });
    }

    if (addState.step === "advice") {
      addState.data.advice = text;
      addState.step = "img";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "10/10 — Image URL (ou `-`)", { parse_mode: "Markdown" });
    }

    if (addState.step === "img") {
      addState.data.img = text === "-" ? "" : text;
      try {
        return await wizardFinish(chatId);
      } catch (e) {
        addWizard.delete(chatId);
        return bot.sendMessage(chatId, `❌ Ajout KO: ${e.message}`);
      }
    }
  }

  // EDIT wizard text input
  const ed = editWizard.get(chatId);
  if (ed && ed.step === "value") {
    try {
      const { id, field } = ed;
      const val = text === "-" ? "" : text;

      const patch = {};
      if (["terpenes", "aroma", "effects"].includes(field)) {
        patch[field] = val ? csvToArr(val) : [];
      } else if (field === "micron") {
        if (val && !isMicron(val)) {
          editWizard.delete(chatId);
          return bot.sendMessage(chatId, "❌ micron invalide: 120u|90u|73u|45u (ou `-`)");
        }
        patch.micron = val ? val : null;
      } else if (field === "type") {
        if (!allowedTypes.has(val)) {
          editWizard.delete(chatId);
          return bot.sendMessage(chatId, "❌ type invalide: hash|weed|extraction|wpff");
        }
        patch.type = val;
      } else {
        patch[field] = val;
      }

      await dbUpdateCard(id, patch);
      editWizard.delete(chatId);
      return bot.sendMessage(chatId, `✅ Modifié #${id} → ${field} mis à jour.`);
    } catch (e) {
      editWizard.delete(chatId);
      return bot.sendMessage(chatId, `❌ edit value: ${e.message}`);
    }
  }
});

app.listen(PORT, () => console.log("Serveur PokéTerps lancé sur le port", PORT));
