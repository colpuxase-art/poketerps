const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;

/* ============ ENV ============ */
 const TOKEN = process.env.BOT_TOKEN || "8549074065:AAGoAsPPxiwhMig1i_-OUQgpVV15L2j0Sa0";r
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!TOKEN) console.error("❌ BOT_TOKEN manquant (Render -> Environment)");
if (!SUPABASE_URL) console.error("❌ SUPABASE_URL manquant (Render -> Environment)");
if (!SUPABASE_SERVICE_ROLE) console.error("❌ SUPABASE_SERVICE_ROLE manquant (Render -> Environment)");

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

const bot = new TelegramBot(TOKEN, { polling: true });

/* ============ ADMIN ============ */
const ADMIN_IDS = new Set([6675436692]); // ton ID
const isAdmin = (chatId) => ADMIN_IDS.has(chatId);

const allowedTypes = new Set(["hash", "weed", "extraction", "wpff"]);
const micronValues = ["120u", "90u", "73u", "45u"];
const isMicron = (v) => micronValues.includes(String(v || "").toLowerCase());

const csvToArr = (str) =>
  (str || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/* ============ DB HELPERS ============ */
async function dbListCards() {
  const { data, error } = await sb
    .from("cards")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function dbGetCard(id) {
  const { data, error } = await sb.from("cards").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function dbInsertCard(payload) {
  const { data, error } = await sb.from("cards").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

async function dbUpdateCard(id, patch) {
  const { data, error } = await sb.from("cards").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

async function dbDeleteCard(id) {
  const { error } = await sb.from("cards").delete().eq("id", id);
  if (error) throw error;
}

/* ============ API POUR MINI-APP ============ */
app.get("/api/cards", async (req, res) => {
  try {
    const cards = await dbListCards();

    // ta mini-app attend: id, name, type, thc, desc, img, terpenes, aroma, effects, advice
    const mapped = cards.map((c) => ({
      ...c,
      desc: c.description ?? "—",
    }));

    res.json(mapped);
  } catch (e) {
    console.error("❌ /api/cards:", e.message);
    res.status(500).json({ error: "db_error", detail: e.message });
  }
});

/* ============ MENU START ============ */
function sendStartMenu(chatId) {
  bot.sendMessage(chatId, "🧬 *Bienvenue dans PokéTerps*\nChoisis une section 👇", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📘 Pokédex", web_app: { url: "https://poketerps.onrender.com" } }],
        [{ text: "ℹ️ Infos", callback_data: "info" }],
      ],
    },
  });
}

bot.onText(/^\/start$/, (msg) => sendStartMenu(msg.chat.id));

bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  try { await bot.answerCallbackQuery(q.id); } catch {}

  if (q.data === "info") {
    return bot.sendMessage(
      chatId,
      "ℹ️ Projet éducatif THC & terpènes.\nAucune vente.\nRespecte la loi.",
    );
  }
});

/* ============ ADMIN COMMANDS ============ */
bot.onText(/^\/myid$/, (msg) => bot.sendMessage(msg.chat.id, `Ton chat_id = ${msg.chat.id}`));

bot.onText(/^\/adminhelp$/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  bot.sendMessage(
    chatId,
    "👑 *Admin PokéTerps*\n\n" +
      "✅ /list [hash|weed|extraction|wpff|120u|90u|73u|45u]\n" +
      "✅ /addform (formulaire)\n" +
      "✅ /editform (formulaire)\n" +
      "✅ /delform (formulaire)\n\n" +
      "✅ /edit <uuid> <field> <value>\n" +
      "✅ /del <uuid>\n",
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
      if (isMicron(filter)) cards = cards.filter((c) => String(c.micron || "").toLowerCase() === filter);
      else cards = cards.filter((c) => String(c.type || "").toLowerCase() === filter);
    }

    if (!cards.length) return bot.sendMessage(chatId, "Aucune fiche.");

    const lines = cards
      .slice(0, 40)
      .map((c) => `${c.id}\n• ${c.type}${c.micron ? " • " + c.micron : ""} • ${c.name}`)
      .join("\n\n");

    bot.sendMessage(chatId, `📚 Fiches (${cards.length})\n\n${lines}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /list: ${e.message}`);
  }
});

/* ============ FORMS (ADD / EDIT / DEL) ============ */
const addWizard = new Map();   // chatId -> { step, data }
const editWizard = new Map();  // chatId -> { id, field, step }
const delWizard = new Map();   // chatId -> { id }

function cancelAdd(chatId) {
  addWizard.delete(chatId);
  bot.sendMessage(chatId, "❌ Ajout annulé.");
}
function cancelEdit(chatId) {
  editWizard.delete(chatId);
  bot.sendMessage(chatId, "❌ Modification annulée.");
}
function cancelDel(chatId) {
  delWizard.delete(chatId);
  bot.sendMessage(chatId, "❌ Suppression annulée.");
}

function askType(chatId) {
  bot.sendMessage(chatId, "2/10 — Choisis la *catégorie* :", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "Hash", callback_data: "add_type_hash" }, { text: "Weed", callback_data: "add_type_weed" }],
        [{ text: "Extraction", callback_data: "add_type_extraction" }, { text: "WPFF", callback_data: "add_type_wpff" }],
        [{ text: "❌ Annuler", callback_data: "add_cancel" }],
      ],
    },
  });
}
function askMicron(chatId) {
  bot.sendMessage(chatId, "3/10 — Choisis le *micron* :", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "120u", callback_data: "add_micron_120u" }, { text: "90u", callback_data: "add_micron_90u" }],
        [{ text: "73u", callback_data: "add_micron_73u" }, { text: "45u", callback_data: "add_micron_45u" }],
        [{ text: "Aucun", callback_data: "add_micron_none" }],
        [{ text: "❌ Annuler", callback_data: "add_cancel" }],
      ],
    },
  });
}

bot.onText(/^\/addform$/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  addWizard.set(chatId, { step: "name", data: {} });
  bot.sendMessage(chatId, "📝 *Ajout fiche*\n\n1/10 — Envoie le *nom*.", {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "add_cancel" }]] },
  });
});

bot.onText(/^\/editform$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const cards = await dbListCards();
    if (!cards.length) return bot.sendMessage(chatId, "Aucune fiche à modifier.");

    const buttons = cards.slice(0, 25).map((c) => [{ text: `${c.name}`, callback_data: `edit_pick_${c.id}` }]);
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

    const buttons = cards.slice(0, 25).map((c) => [{ text: `🗑️ ${c.name}`, callback_data: `del_pick_${c.id}` }]);
    buttons.push([{ text: "❌ Annuler", callback_data: "del_cancel" }]);

    bot.sendMessage(chatId, "🗑️ Choisis la fiche à supprimer :", {
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (e) {
    bot.sendMessage(chatId, `❌ /delform: ${e.message}`);
  }
});

bot.on("callback_query", async (q) => {
  const chatId = q.message?.chat?.id;
  if (!chatId) return;
  try { await bot.answerCallbackQuery(q.id); } catch {}

  // cancels
  if (q.data === "add_cancel") return cancelAdd(chatId);
  if (q.data === "edit_cancel") return cancelEdit(chatId);
  if (q.data === "del_cancel") return cancelDel(chatId);

  // ADD flow
  if (q.data?.startsWith("add_type_")) {
    const st = addWizard.get(chatId);
    if (!st) return;
    const t = q.data.replace("add_type_", "");
    if (!allowedTypes.has(t)) return;

    st.data.type = t;
    st.step = "micron";
    addWizard.set(chatId, st);
    return askMicron(chatId);
  }

  if (q.data?.startsWith("add_micron_")) {
    const st = addWizard.get(chatId);
    if (!st) return;
    const m = q.data.replace("add_micron_", "");
    st.data.micron = m === "none" ? null : m;
    st.step = "thc";
    addWizard.set(chatId, st);

    return bot.sendMessage(chatId, "4/10 — Envoie le *THC* (ex: `THC: 35–55%`).", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "add_cancel" }]] },
    });
  }

  // EDIT pick
  if (q.data?.startsWith("edit_pick_")) {
    const id = q.data.replace("edit_pick_", "");
    const card = await dbGetCard(id);
    if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");

    return bot.sendMessage(chatId, "Choisis le champ :", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Nom", callback_data: `edit_field_${id}_name` }, { text: "Type", callback_data: `edit_field_${id}_type` }],
          [{ text: "Micron", callback_data: `edit_field_${id}_micron` }, { text: "THC", callback_data: `edit_field_${id}_thc` }],
          [{ text: "Description", callback_data: `edit_field_${id}_description` }, { text: "Image", callback_data: `edit_field_${id}_img` }],
          [{ text: "Terpènes", callback_data: `edit_field_${id}_terpenes` }, { text: "Arômes", callback_data: `edit_field_${id}_aroma` }],
          [{ text: "Effets", callback_data: `edit_field_${id}_effects` }, { text: "Conseils", callback_data: `edit_field_${id}_advice` }],
          [{ text: "❌ Annuler", callback_data: "edit_cancel" }],
        ],
      },
    });
  }

  if (q.data?.startsWith("edit_field_")) {
    const parts = q.data.split("_");
    const id = parts[2];
    const field = parts.slice(3).join("_");

    if (field === "type") {
      return bot.sendMessage(chatId, "Nouveau type :", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Hash", callback_data: `edit_type_${id}_hash` }, { text: "Weed", callback_data: `edit_type_${id}_weed` }],
            [{ text: "Extraction", callback_data: `edit_type_${id}_extraction` }, { text: "WPFF", callback_data: `edit_type_${id}_wpff` }],
            [{ text: "❌ Annuler", callback_data: "edit_cancel" }],
          ],
        },
      });
    }

    if (field === "micron") {
      return bot.sendMessage(chatId, "Nouveau micron :", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "120u", callback_data: `edit_micron_${id}_120u` }, { text: "90u", callback_data: `edit_micron_${id}_90u` }],
            [{ text: "73u", callback_data: `edit_micron_${id}_73u` }, { text: "45u", callback_data: `edit_micron_${id}_45u` }],
            [{ text: "Aucun", callback_data: `edit_micron_${id}_none` }],
            [{ text: "❌ Annuler", callback_data: "edit_cancel" }],
          ],
        },
      });
    }

    editWizard.set(chatId, { id, field, step: "value" });
    return bot.sendMessage(chatId, `✍️ Envoie la nouvelle valeur pour *${field}* (ou \`-\` pour vider).`, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "edit_cancel" }]] },
    });
  }

  if (q.data?.startsWith("edit_type_")) {
    const parts = q.data.split("_");
    const id = parts[2];
    const newType = parts[3];
    if (!allowedTypes.has(newType)) return bot.sendMessage(chatId, "❌ Type invalide.");

    await dbUpdateCard(id, { type: newType });
    return bot.sendMessage(chatId, "✅ Type mis à jour.");
  }

  if (q.data?.startsWith("edit_micron_")) {
    const parts = q.data.split("_");
    const id = parts[2];
    const m = parts[3] === "none" ? null : parts[3];
    if (m && !isMicron(m)) return bot.sendMessage(chatId, "❌ Micron invalide.");

    await dbUpdateCard(id, { micron: m });
    return bot.sendMessage(chatId, `✅ Micron mis à jour: ${m || "Aucun"}`);
  }

  // DEL pick
  if (q.data?.startsWith("del_pick_")) {
    const id = q.data.replace("del_pick_", "");
    const card = await dbGetCard(id);
    if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");

    delWizard.set(chatId, { id });
    return bot.sendMessage(chatId, `⚠️ Confirmer suppression de:\n${card.name}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ CONFIRMER", callback_data: `del_confirm_${id}` }],
          [{ text: "❌ Annuler", callback_data: "del_cancel" }],
        ],
      },
    });
  }

  if (q.data?.startsWith("del_confirm_")) {
    const id = q.data.replace("del_confirm_", "");
    const st = delWizard.get(chatId);
    if (!st || st.id !== id) return bot.sendMessage(chatId, "Relance /delform.");

    await dbDeleteCard(id);
    delWizard.delete(chatId);
    return bot.sendMessage(chatId, "🗑️ Supprimé.");
  }
});

/* ============ TEXT INPUT FOR ADD/EDIT ============ */
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  if (!isAdmin(chatId)) return;
  if (text.startsWith("/")) return;

  const addState = addWizard.get(chatId);
  if (addState) {
    if (addState.step === "name") {
      addState.data.name = text;
      addState.step = "type";
      addWizard.set(chatId, addState);
      return askType(chatId);
    }

    if (addState.step === "thc") {
      addState.data.thc = text;
      addState.step = "description";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "5/10 — Envoie la *description*.", { parse_mode: "Markdown" });
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

      const d = addState.data;
      try {
        const inserted = await dbInsertCard({
          name: d.name,
          type: d.type,
          micron: d.micron,
          thc: d.thc || "—",
          description: d.description || "—",
          img: d.img || "https://i.imgur.com/0HqWQvH.png",
          terpenes: csvToArr(d.terpenes),
          aroma: csvToArr(d.aroma),
          effects: csvToArr(d.effects),
          advice: d.advice || "Info éducative. Les effets varient. Respecte la loi.",
        });

        addWizard.delete(chatId);
        return bot.sendMessage(chatId, `✅ Ajouté: ${inserted.name}`);
      } catch (e) {
        addWizard.delete(chatId);
        return bot.sendMessage(chatId, `❌ Ajout KO: ${e.message}`);
      }
    }
  }

  const ed = editWizard.get(chatId);
  if (ed && ed.step === "value") {
    const val = text === "-" ? "" : text;
    const patch = {};

    if (["terpenes", "aroma", "effects"].includes(ed.field)) patch[ed.field] = val ? csvToArr(val) : [];
    else patch[ed.field] = val;

    try {
      await dbUpdateCard(ed.id, patch);
      editWizard.delete(chatId);
      return bot.sendMessage(chatId, "✅ Modifié.");
    } catch (e) {
      editWizard.delete(chatId);
      return bot.sendMessage(chatId, `❌ Modif KO: ${e.message}`);
    }
  }
});

app.listen(PORT, () => console.log("Serveur PokéTerps lancé sur le port", PORT));
