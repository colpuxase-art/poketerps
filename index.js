
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

// =========================
// Static (mini-app)
// =========================
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const PORT = process.env.PORT || 3000;

// =========================
// ENV
// =========================
const TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const WEBAPP_URL = process.env.WEBAPP_URL || "";

const START_IMAGE_URL =
  process.env.START_IMAGE_URL || "https://i.postimg.cc/9Qp0JmJY/harvestdex-start.jpg";
const INFO_IMAGE_URL =
  process.env.INFO_IMAGE_URL || "https://i.postimg.cc/3w3qj7tK/harvestdex-info.jpg";
const SUPPORT_IMAGE_URL =
  process.env.SUPPORT_IMAGE_URL || "https://i.postimg.cc/8C6r8V5p/harvestdex-support.jpg";

// 👉 MODE BOT: webhook si WEBHOOK_URL présent, sinon polling (comme avant)
const WEBHOOK_URL = (process.env.WEBHOOK_URL || "").trim();

if (!TOKEN) {
  console.error("❌ BOT_TOKEN manquant.");
  process.exit(1);
}

const supabaseReady = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE);
if (!supabaseReady) {
  console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE manquant.");
}

const sb = supabaseReady
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } })
  : null;

function assertSupabase() {
  if (!sb) throw new Error("Supabase non configuré (variables manquantes).");
}

// =========================
// Admin
// =========================
const ADMIN_IDS = new Set([6675436692]); // ✅ TON USER ID
const isAdminUser = (userId) => ADMIN_IDS.has(Number(userId));

// =========================
// Cache
// =========================
const _cache = {
  subcategories: { ts: 0, data: [] },
  farms: { ts: 0, data: [] },
};
const CACHE_TTL_MS = 60_000;

// =========================
// DB: compat FR/EN (tables + colonnes)
// =========================
const TABLES = {
  cards: ["cards", "cartes"],
  favorites: ["favorites", "favoris"],
  farms: ["farms", "fermes"],
  subcategories: ["subcategories", "sous-categories", "sous_categories", "sous-catégories"],
  track: ["track_events", "tracking_events", "events", "trackevent"],
};

function isMissingRelation(err) {
  const m = String(err?.message || "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("relation") ||
    m.includes("not found") ||
    m.includes("schema cache") ||
    m.includes("could not find the table")
  );
}

async function runWithTable(candidates, fn) {
  let lastErr = null;
  for (const t of candidates) {
    try {
      return await fn(t);
    } catch (e) {
      lastErr = e;
      if (isMissingRelation(e)) continue;
      throw e;
    }
  }
  throw lastErr || new Error("Table introuvable");
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) return obj[k];
  }
  return undefined;
}

function normalizeArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function normalizeCardRow(r) {
  if (!r) return null;

  const id = pick(r, ["id"]);
  const name = pick(r, ["nom", "name"]) ?? "";
  const type = pick(r, ["taper", "type"]) ?? "";
  const thc = pick(r, ["THC", "thc"]) ?? "";
  const description = pick(r, ["description", "desc"]) ?? "";
  const img = pick(r, ["img", "image"]) ?? "";
  const advice = pick(r, ["conseil", "advice"]) ?? "";
  const micron = pick(r, ["micron"]) ?? null;

  const terpenes = normalizeArray(pick(r, ["terpènes", "terpenes"]));
  const aroma = normalizeArray(pick(r, ["arôme", "arome", "aroma"]));
  const effects = normalizeArray(pick(r, ["effets", "effects"]));

  const season = pick(r, ["saison", "season"]) ?? null;
  const weed_kind = pick(r, ["type_de_mauvaise_herbe", "weed_kind"]) ?? null;

  const subcategory_id = pick(r, ["sous-catégorie_id", "subcategory_id"]) ?? null;
  const farm_id = pick(r, ["ferme_id", "farm_id"]) ?? null;

  const rarity = pick(r, ["rareté", "rarity"]) ?? null;

  const is_featured = Boolean(pick(r, ["est_mis_en_avant", "is_featured"]) ?? false);
  const featured_title = pick(r, ["titre_vedette", "featured_title"]) ?? null;

  const is_partner = Boolean(pick(r, ["est_partenaire", "is_partner"]) ?? false);
  const partner_title = pick(r, ["titre_partenaire", "partner_title"]) ?? null;

  const created_at = pick(r, ["created_at"]) ?? null;

  return {
    id,
    name,
    type,
    thc,
    description,
    img,
    advice,
    micron,
    terpenes,
    aroma,
    effects,
    season,
    weed_kind,
    subcategory_id,
    farm_id,
    rarity,
    is_featured,
    featured_title,
    is_partner,
    partner_title,
    created_at,
  };
}

function denormalizeCardPayload(payload, tableName) {
  const isFR = tableName === "cartes";
  const out = {};

  const name = payload.name ?? payload.nom;
  const type = payload.type ?? payload.taper;
  const thc = payload.thc ?? payload.THC;
  const description = payload.description;
  const img = payload.img ?? payload.image;
  const advice = payload.advice ?? payload.conseil;
  const micron = payload.micron ?? null;
  const terpenes = payload.terpenes ?? [];
  const aroma = payload.aroma ?? payload.arome ?? [];
  const effects = payload.effects ?? [];
  const season = payload.season ?? payload.saison ?? null;

  const weed_kind = payload.weed_kind ?? payload.type_de_mauvaise_herbe ?? null;
  const subcategory_id = payload.subcategory_id ?? payload["sous-catégorie_id"] ?? null;
  const farm_id = payload.farm_id ?? payload["ferme_id"] ?? null;

  if (isFR) {
    out.nom = name ?? null;
    out.taper = type ?? null;
    out.THC = thc ?? null;
    out.description = description ?? null;
    out.image = img ?? null;
    out.conseil = advice ?? null;
    out.micron = micron ?? null;
    out["terpènes"] = terpenes ?? [];
    out["arôme"] = aroma ?? [];
    out.effets = effects ?? [];
    out.saison = season;
    out.type_de_mauvaise_herbe = weed_kind;
    out["sous-catégorie_id"] = subcategory_id;
    out["ferme_id"] = farm_id;
  } else {
    out.name = name ?? null;
    out.type = type ?? null;
    out.thc = thc ?? null;
    out.description = description ?? null;
    out.img = img ?? null;
    out.advice = advice ?? null;
    out.micron = micron ?? null;
    out.terpenes = terpenes ?? [];
    out.aroma = aroma ?? [];
    out.effects = effects ?? [];
    out.season = season;
    out.weed_kind = weed_kind;
    out.subcategory_id = subcategory_id;
    out.farm_id = farm_id;
  }
  return out;
}

function denormalizeFarmPayload(payload, tableName) {
  const isFR = tableName === "fermes";
  const out = {};
  const name = payload.name ?? payload.nom ?? null;

  out.name = name;
  out.country = payload.country ?? payload.pays ?? null;
  out.instagram = payload.instagram ?? null;
  out.website = payload.website ?? payload.site ?? null;
  out.is_active = payload.is_active ?? true;

  return out;
}

// =========================
// DB: reads (subcategories, farms)
// =========================
async function dbListSubcategories() {
  assertSupabase();
  return runWithTable(TABLES.subcategories, async (t) => {
    const { data, error } = await sb
      .from(t)
      .select("*")
      .eq("is_active", true)
      .order("type", { ascending: true })
      .order("sort", { ascending: true });
    if (error) throw error;
    return data || [];
  });
}

async function dbListFarms() {
  assertSupabase();
  return runWithTable(TABLES.farms, async (t) => {
    const { data, error } = await sb.from(t).select("*").eq("is_active", true).order("name", { ascending: true });
    if (error) throw error;
    return data || [];
  });
}

async function dbInsertFarm(payload) {
  assertSupabase();
  return runWithTable(TABLES.farms, async (t) => {
    const insertPayload = denormalizeFarmPayload(payload, t);
    const { data, error } = await sb.from(t).insert(insertPayload).select("*").single();
    if (error) throw error;
    return data;
  });
}

async function getSubcategoriesSafe() {
  const now = Date.now();
  if (_cache.subcategories.data.length && now - _cache.subcategories.ts < CACHE_TTL_MS) return _cache.subcategories.data;
  try {
    const rows = await dbListSubcategories();
    _cache.subcategories = { ts: now, data: rows };
    return rows;
  } catch {
    _cache.subcategories = { ts: now, data: [] };
    return [];
  }
}

async function getFarmsSafe() {
  const now = Date.now();
  if (_cache.farms.data.length && now - _cache.farms.ts < CACHE_TTL_MS) return _cache.farms.data;
  try {
    const rows = await dbListFarms();
    _cache.farms = { ts: now, data: rows };
    return rows;
  } catch {
    _cache.farms = { ts: now, data: [] };
    return [];
  }
}

app.get("/api/subcategories", async (req, res) => {
  try {
    res.json(await getSubcategoriesSafe());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/farms", async (req, res) => {
  try {
    res.json(await getFarmsSafe());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =========================
// Cards CRUD
// =========================
async function dbListCards() {
  assertSupabase();
  return runWithTable(TABLES.cards, async (t) => {
    const { data, error } = await sb.from(t).select("*").order("id", { ascending: true });
    if (error) throw error;
    return (data || []).map(normalizeCardRow).filter(Boolean);
  });
}

async function dbGetCard(id) {
  assertSupabase();
  return runWithTable(TABLES.cards, async (t) => {
    const { data, error } = await sb.from(t).select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return normalizeCardRow(data);
  });
}

async function dbInsertCard(payload) {
  assertSupabase();
  return runWithTable(TABLES.cards, async (t) => {
    const insertPayload = denormalizeCardPayload(payload, t);
    const { data, error } = await sb.from(t).insert(insertPayload).select("*").single();
    if (error) throw error;
    return normalizeCardRow(data);
  });
}

async function dbUpdateCard(id, patch) {
  assertSupabase();
  return runWithTable(TABLES.cards, async (t) => {
    const updatePayload = denormalizeCardPayload(patch, t);
    const { data, error } = await sb.from(t).update(updatePayload).eq("id", id).select("*").single();
    if (error) throw error;
    return normalizeCardRow(data);
  });
}

async function dbDeleteCard(id) {
  assertSupabase();
  return runWithTable(TABLES.cards, async (t) => {
    const { error } = await sb.from(t).delete().eq("id", id);
    if (error) throw error;
    return true;
  });
}

// =========================
// Featured + Partner
// =========================
async function dbGetFeatured() {
  assertSupabase();
  return runWithTable(TABLES.cards, async (t) => {
    const col = t === "cartes" ? "est_mis_en_avant" : "is_featured";
    const { data, error } = await sb.from(t).select("*").eq(col, true).order("id", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return normalizeCardRow(data);
  });
}

async function dbSetFeatured(id, title) {
  assertSupabase();
  return runWithTable(TABLES.cards, async (t) => {
    const flag = t === "cartes" ? "est_mis_en_avant" : "is_featured";
    const titleCol = t === "cartes" ? "titre_vedette" : "featured_title";

    const { error: e1 } = await sb.from(t).update({ [flag]: false, [titleCol]: null }).eq(flag, true);
    if (e1) throw e1;

    const patch = { [flag]: true, [titleCol]: title || "✨ Shiny du moment" };
    const { data, error: e2 } = await sb.from(t).update(patch).eq("id", id).select("*").single();
    if (e2) throw e2;

    return normalizeCardRow(data);
  });
}

async function dbUnsetFeatured() {
  assertSupabase();
  return runWithTable(TABLES.cards, async (t) => {
    const flag = t === "cartes" ? "est_mis_en_avant" : "is_featured";
    const titleCol = t === "cartes" ? "titre_vedette" : "featured_title";
    const { error } = await sb.from(t).update({ [flag]: false, [titleCol]: null }).eq(flag, true);
    if (error) throw error;
    return true;
  });
}

async function dbGetPartner() {
  assertSupabase();
  return runWithTable(TABLES.cards, async (t) => {
    const col = t === "cartes" ? "est_partenaire" : "is_partner";
    const { data, error } = await sb.from(t).select("*").eq(col, true).order("id", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return normalizeCardRow(data);
  });
}

async function dbSetPartner(id, title) {
  assertSupabase();
  return runWithTable(TABLES.cards, async (t) => {
    const flag = t === "cartes" ? "est_partenaire" : "is_partner";
    const titleCol = t === "cartes" ? "titre_partenaire" : "partner_title";

    const { error: e1 } = await sb.from(t).update({ [flag]: false, [titleCol]: null }).eq(flag, true);
    if (e1) throw e1;

    const patch = { [flag]: true, [titleCol]: title || "🤝 Partenaire du moment" };
    const { data, error: e2 } = await sb.from(t).update(patch).eq("id", id).select("*").single();
    if (e2) throw e2;

    return normalizeCardRow(data);
  });
}

async function dbUnsetPartner() {
  assertSupabase();
  return runWithTable(TABLES.cards, async (t) => {
    const flag = t === "cartes" ? "est_partenaire" : "is_partner";
    const titleCol = t === "cartes" ? "titre_partenaire" : "partner_title";
    const { error } = await sb.from(t).update({ [flag]: false, [titleCol]: null }).eq(flag, true);
    if (error) throw error;
    return true;
  });
}

// =========================
// Home sections (popular / trending / newest)
// =========================
async function getFavoriteCounts() {
  // returns Map(card_id -> count)
  try {
    assertSupabase();
    const rows = await runWithTable(TABLES.favorites, async (t) => {
      const { data, error } = await sb.from(t).select("card_id");
      if (error) throw error;
      return data || [];
    });
    const map = new Map();
    for (const r of rows) {
      const id = String(r.card_id);
      map.set(id, (map.get(id) || 0) + 1);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function getFavoriteCountsSince(isoDate) {
  try {
    assertSupabase();
    const rows = await runWithTable(TABLES.favorites, async (t) => {
      // best effort: created_at may exist
      let q = sb.from(t).select("card_id, created_at");
      if (isoDate) q = q.gte("created_at", isoDate);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    });
    const map = new Map();
    for (const r of rows) {
      const id = String(r.card_id);
      map.set(id, (map.get(id) || 0) + 1);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function getViewCountsSince(isoDate) {
  // expects track_events with card_id + created_at + (optional) event/type
  try {
    assertSupabase();
    const rows = await runWithTable(TABLES.track, async (t) => {
      let q = sb.from(t).select("card_id, created_at, event, type, event_type");
      if (isoDate) q = q.gte("created_at", isoDate);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    });

    const map = new Map();
    for (const r of rows) {
      const id = r.card_id != null ? String(r.card_id) : null;
      if (!id) continue;
      map.set(id, (map.get(id) || 0) + 1);
    }
    return map;
  } catch {
    return new Map();
  }
}

function enrichCardsWithLabels(cards, subcategories, farms) {
  const subMap = new Map((subcategories || []).map((s) => [String(s.id), s]));
  const farmMap = new Map((farms || []).map((f) => [String(f.id), f]));

  return (cards || []).map((c) => {
    const scId = c.subcategory_id ?? null;
    const sc = scId != null ? subMap.get(String(scId)) : null;

    const farmId = c.farm_id ?? null;
    const farm = farmId != null ? farmMap.get(String(farmId)) : null;

    return {
      ...c,
      subcategory: sc?.label || null,
      subcategory_type: sc?.type || null,
      farm: farm
        ? { id: farm.id, name: farm.name, country: farm.country, instagram: farm.instagram, website: farm.website }
        : null,
    };
  });
}

app.get("/api/cards", async (req, res) => {
  try {
    const [cards, subs, farms] = await Promise.all([dbListCards(), getSubcategoriesSafe(), getFarmsSafe()]);
    res.json(enrichCardsWithLabels(cards, subs, farms));
  } catch (e) {
    console.error("❌ /api/cards:", e.message);
    res.status(500).json({ error: "db_error", message: e.message });
  }
});

app.get("/api/featured", async (req, res) => {
  try {
    const [c, subs, farms] = await Promise.all([dbGetFeatured(), getSubcategoriesSafe(), getFarmsSafe()]);
    if (!c) return res.json(null);
    res.json(enrichCardsWithLabels([c], subs, farms)[0]);
  } catch (e) {
    res.status(500).json({ error: "db_error", message: e.message });
  }
});

app.get("/api/partner", async (req, res) => {
  try {
    const [c, subs, farms] = await Promise.all([dbGetPartner(), getSubcategoriesSafe(), getFarmsSafe()]);
    if (!c) return res.json(null);
    res.json(enrichCardsWithLabels([c], subs, farms)[0]);
  } catch (e) {
    res.status(500).json({ error: "db_error", message: e.message });
  }
});

app.get("/api/home", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(12, Number(req.query.limit) || 8));

    const [cards, subs, farms, favAll, viewsAll] = await Promise.all([
      dbListCards(),
      getSubcategoriesSafe(),
      getFarmsSafe(),
      getFavoriteCounts(),
      getViewCountsSince(null),
    ]);

    const now = new Date();
    const since7 = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
    const since30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();

    const [fav7, views7] = await Promise.all([getFavoriteCountsSince(since7), getViewCountsSince(since7)]);

    const enriched = enrichCardsWithLabels(cards, subs, farms);

    // popular: favAll + viewsAll
    const popular = [...enriched]
      .map((c) => ({
        ...c,
        _score: (favAll.get(String(c.id)) || 0) * 3 + (viewsAll.get(String(c.id)) || 0),
      }))
      .sort((a, b) => b._score - a._score)
      .slice(0, limit);

    // trending: fav7 + views7
    const trending = [...enriched]
      .map((c) => ({
        ...c,
        _score: (fav7.get(String(c.id)) || 0) * 3 + (views7.get(String(c.id)) || 0),
      }))
      .sort((a, b) => b._score - a._score)
      .slice(0, limit);

    // newest: created_at last 30d if present, else id desc
    const newestPool = enriched.filter((c) => !c.created_at || String(c.created_at) >= since30);
    const newest = newestPool.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0)).slice(0, limit);

    const [featured, partner] = await Promise.all([dbGetFeatured(), dbGetPartner()]);
    const out = {
      featured: featured ? enrichCardsWithLabels([featured], subs, farms)[0] : null,
      partner: partner ? enrichCardsWithLabels([partner], subs, farms)[0] : null,
      popular,
      trending,
      newest,
    };

    res.json(out);
  } catch (e) {
    res.status(500).json({ error: "db_error", message: e.message });
  }
});

// =========================
// Favorites (Mon Dex)
// =========================
app.post("/api/favorite", async (req, res) => {
  try {
    assertSupabase();
    const { user_id, card_id } = req.body || {};
    if (!user_id || !card_id) return res.status(400).json({ error: "missing user_id/card_id" });

    const existing = await runWithTable(TABLES.favorites, async (t) => {
      const { data, error } = await sb.from(t).select("id").eq("user_id", user_id).eq("card_id", card_id).maybeSingle();
      if (error) throw error;
      return data;
    });

    if (existing?.id) {
      await runWithTable(TABLES.favorites, async (t) => {
        const { error } = await sb.from(t).delete().eq("id", existing.id);
        if (error) throw error;
      });
      return res.json({ favorited: false });
    } else {
      await runWithTable(TABLES.favorites, async (t) => {
        const { error } = await sb.from(t).insert({ user_id, card_id });
        if (error) throw error;
      });
      return res.json({ favorited: true });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get("/api/mydex/:user_id", async (req, res) => {
  try {
    assertSupabase();
    const user_id = req.params.user_id;

    const favs = await runWithTable(TABLES.favorites, async (t) => {
      const { data, error } = await sb.from(t).select("card_id").eq("user_id", user_id);
      if (error) throw error;
      return data || [];
    });

    const ids = (favs || []).map((f) => f.card_id);
    if (!ids.length) return res.json([]);

    const cards = await runWithTable(TABLES.cards, async (t) => {
      const { data, error } = await sb.from(t).select("*").in("id", ids).order("id", { ascending: false });
      if (error) throw error;
      return (data || []).map(normalizeCardRow).filter(Boolean);
    });

    const [subs, farms] = await Promise.all([getSubcategoriesSafe(), getFarmsSafe()]);
    res.json(enrichCardsWithLabels(cards || [], subs, farms));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =========================
// TELEGRAM BOT (polling/webhook)
// =========================
let bot;

if (WEBHOOK_URL) {
  bot = new TelegramBot(TOKEN);
  const hookPath = `/bot${TOKEN}`;
  bot.setWebHook(`${WEBHOOK_URL}${hookPath}`);

  app.post(hookPath, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });

  console.log("✅ Bot en mode WEBHOOK :", `${WEBHOOK_URL}${hookPath}`);
} else {
  bot = new TelegramBot(TOKEN, { polling: true });
  console.log("✅ Bot en mode POLLING");
}

// =========================
// /start menu (⚠️ sans Markdown pour éviter les ETELEGRAM 400)
// =========================
function buildStartKeyboard(userId) {
  const admin = isAdminUser(userId);
  const keyboard = [
    [{ text: "📘 Ouvrir le Dex", web_app: { url: WEBAPP_URL } }],
    [
      { text: "⭐ Mon Dex", web_app: { url: WEBAPP_URL + "#mydex" } },
      { text: "👤 Profil", web_app: { url: WEBAPP_URL + "#profile" } },
    ],
    [{ text: "ℹ️ Informations", callback_data: "menu_info" }],
    [{ text: "🤝 Nous soutenir", callback_data: "menu_support" }],
  ];
  if (admin) keyboard.push([{ text: "🧰 Admin", callback_data: "menu_admin" }]);
  return keyboard;
}

function sendStartMenu(chatId, userId) {
  const caption =
    "🧬 HarvestDex\n\n" +
    "Collectionne tes fiches, ajoute-les à Mon Dex et explore les catégories 🔥";
  const keyboard = buildStartKeyboard(userId);

  return bot
    .sendPhoto(chatId, START_IMAGE_URL, {
      caption,
      reply_markup: { inline_keyboard: keyboard },
    })
    .catch(() => {
      return bot.sendMessage(chatId, caption, {
        reply_markup: { inline_keyboard: keyboard },
      });
    });
}

bot.onText(/^\/start$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  sendStartMenu(chatId, userId);
});

// ✅ /adminhelp (texte simple)
bot.onText(/^\/admin(?:help)?$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  const txt =
`👑 Commandes Admin

Ajout / édition
• /addform — ajouter une fiche (sous-catégorie + farm)
• /editform — modifier via menus
• /delform — supprimer via menus
• /edit <id> <champ> <valeur> — édition rapide
• /del <id> — suppression rapide
• /list (option: weed|hash|extraction|wpff|90u|indica...)

Rare
• /rare <id> (titre optionnel)
• /unrare
• /rareinfo

Partenaire
• /partner <id> (titre optionnel)
• /unpartner
• /partnerinfo

Debug
• /dbtest
• /myid
`;

  return bot.sendMessage(chatId, txt);
});

bot.onText(/^\/myid$/, (msg) => {
  bot.sendMessage(msg.chat.id, `user_id = ${msg.from?.id}\nchat_id = ${msg.chat.id}`);
});

bot.onText(/^\/dbtest$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return;

  try {
    assertSupabase();
    const { error } = await sb.from("cards").select("id").limit(1);
    if (error) throw error;
    bot.sendMessage(chatId, "✅ Supabase OK (table cards accessible)");
  } catch (e) {
    bot.sendMessage(chatId, `❌ Supabase KO: ${e.message}`);
  }
});

// =========================
// Rare commands
// =========================
bot.onText(/^\/rare\s+(\d+)(?:\s+([\s\S]+))?$/m, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const id = Number(match[1]);
    const title = (match[2] || "").trim();

    const card = await dbGetCard(id);
    if (!card) return bot.sendMessage(chatId, "❌ ID introuvable.");

    const updated = await dbSetFeatured(id, title || "✨ Shiny du moment");
    bot.sendMessage(chatId, `✅ Rare activée: #${updated.id} — ${updated.name}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /rare: ${e.message}`);
  }
});

bot.onText(/^\/unrare$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    await dbUnsetFeatured();
    bot.sendMessage(chatId, "✅ Rare désactivée.");
  } catch (e) {
    bot.sendMessage(chatId, `❌ /unrare: ${e.message}`);
  }
});

bot.onText(/^\/rareinfo$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const c = await dbGetFeatured();
    if (!c) return bot.sendMessage(chatId, "Aucune Rare du moment actuellement.");
    bot.sendMessage(chatId, `Rare actuelle: #${c.id} — ${c.name}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /rareinfo: ${e.message}`);
  }
});

// =========================
// Partner commands
// =========================
bot.onText(/^\/partner\s+(\d+)(?:\s+([\s\S]+))?$/m, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const id = Number(match[1]);
    const title = (match[2] || "").trim();

    const card = await dbGetCard(id);
    if (!card) return bot.sendMessage(chatId, "❌ ID introuvable.");

    const updated = await dbSetPartner(id, title || "🤝 Partenaire du moment");
    bot.sendMessage(chatId, `✅ Partenaire activé: #${updated.id} — ${updated.name}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /partner: ${e.message}`);
  }
});

bot.onText(/^\/unpartner$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    await dbUnsetPartner();
    bot.sendMessage(chatId, "✅ Partenaire désactivé.");
  } catch (e) {
    bot.sendMessage(chatId, `❌ /unpartner: ${e.message}`);
  }
});

bot.onText(/^\/partnerinfo$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const c = await dbGetPartner();
    if (!c) return bot.sendMessage(chatId, "Aucun partenaire actif.");
    bot.sendMessage(chatId, `Partenaire actif: #${c.id} — ${c.name}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /partnerinfo: ${e.message}`);
  }
});

// =========================
// NOTE: tes wizards / addform / editform / delform existent déjà dans ta base.
// Ici on garde ton fichier actuel tel quel si tu l'as (sinon on peut le réintégrer).
// =========================

// =========================
// Start server last
// =========================
app.listen(PORT, () => console.log("Serveur HarvestDex lancé sur le port", PORT));
