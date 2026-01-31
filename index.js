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

// ✅ IMPORTANT Render: webhook recommandé
// Exemple: WEBHOOK_URL=https://poketerps.onrender.com
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
// Subcategories + Farms (DB-first)
// =========================

// ⚠️ Fallback uniquement si la table `subcategories` n'existe pas encore.
// (utile pour booter le projet en dev)
const DEFAULT_SUBCATEGORIES = [
  // HASH
  { id: "dry_sift", type: "hash", label: "Dry Sift", sort: 10 },
  { id: "static_sift", type: "hash", label: "Static Sift", sort: 15 },
  { id: "kief_pollen", type: "hash", label: "Kief / Pollen", sort: 18 },
  { id: "ice_o_lator", type: "hash", label: "Ice-O-Lator / Bubble", sort: 20 },
  { id: "full_melt", type: "hash", label: "Full Melt", sort: 25 },
  { id: "temple_ball", type: "hash", label: "Temple Ball", sort: 30 },
  { id: "piatella", type: "hash", label: "Piatella", sort: 35 },
  { id: "charas", type: "hash", label: "Charas / Hand Rubbed", sort: 40 },
  { id: "pressed_hash", type: "hash", label: "Pressed Hash", sort: 45 },

  // WEED (style de culture)
  { id: "indoor", type: "weed", label: "Indoor", sort: 10 },
  { id: "greenhouse", type: "weed", label: "Greenhouse", sort: 20 },
  { id: "outdoor", type: "weed", label: "Outdoor", sort: 30 },
  { id: "living_soil", type: "weed", label: "Living Soil", sort: 40 },
  { id: "organic", type: "weed", label: "Organic", sort: 50 },
  { id: "hydro", type: "weed", label: "Hydro", sort: 60 },

  // EXTRACTION
  { id: "rosin", type: "extraction", label: "Rosin", sort: 10 },
  { id: "live_rosin", type: "extraction", label: "Live Rosin", sort: 15 },
  { id: "resin", type: "extraction", label: "Resin", sort: 20 },
  { id: "live_resin", type: "extraction", label: "Live Resin", sort: 25 },
  { id: "bho", type: "extraction", label: "BHO", sort: 30 },
  { id: "shatter", type: "extraction", label: "Shatter", sort: 35 },
  { id: "wax", type: "extraction", label: "Wax / Budder", sort: 40 },
  { id: "crumble", type: "extraction", label: "Crumble", sort: 45 },
  { id: "diamonds", type: "extraction", label: "Diamonds", sort: 60 },
  { id: "sauce", type: "extraction", label: "Sauce", sort: 65 },
  { id: "distillate", type: "extraction", label: "Distillate", sort: 70 },
  { id: "rso", type: "extraction", label: "RSO", sort: 80 },

  // WPFF
  { id: "wpff_fresh_frozen", type: "wpff", label: "Fresh Frozen", sort: 10 },
  { id: "wpff_whole_plant", type: "wpff", label: "Whole Plant", sort: 15 },
  { id: "wpff_first_pull", type: "wpff", label: "First Pull", sort: 20 },
  { id: "wpff_full_spectrum", type: "wpff", label: "Full Spectrum", sort: 30 },
];

// Cache simple (évite de spammer la DB)
const _cache = {
  subcategories: { ts: 0, data: [] },
  farms: { ts: 0, data: [] },
};
const CACHE_TTL_MS = 60_000;

// =========================
// DB: compat FR/EN (tables + colonnes)
// =========================
const TABLES = {
  cards: ["cartes", "cards"],
  favorites: ["favoris", "favorites"],
  farms: ["fermes", "farms"],
  subcategories: ["subcategories", "sous-catégories", "sous_categories", "sous-categories"],
};

function isMissingRelation(err) {
  const m = String(err?.message || "").toLowerCase();
  return m.includes("does not exist") || m.includes("relation") || m.includes("not found");
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
  // parfois stocké en texte "a,b,c"
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
  const img = pick(r, ["image", "img"]) ?? "";
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
  };
}

function denormalizeCardPayload(payload, tableName) {
  // payload arrive en schéma "front/bot" (anglais)
  // On convertit selon la table cible.
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
    // Rare/Partner: gérés par endpoints admin
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
  // on suppose mêmes colonnes (name/country/instagram/website/is_active)
  // si jamais tu as des noms FR, on garde la compat en double
  const name = payload.name ?? payload.nom ?? null;
  if (isFR) {
    out.name = name;
    out.country = payload.country ?? payload.pays ?? null;
    out.instagram = payload.instagram ?? null;
    out.website = payload.website ?? payload.site ?? null;
    out.is_active = payload.is_active ?? true;
  } else {
    out.name = name;
    out.country = payload.country ?? null;
    out.instagram = payload.instagram ?? null;
    out.website = payload.website ?? null;
    out.is_active = payload.is_active ?? true;
  }
  return out;
}

// =========================
// DB: reads (subcategories, farms)
// =========================
async function dbListSubcategories() {
  assertSupabase();
  return runWithTable(TABLES.subcategories, async (t) => {
    const { data, error } = await sb.from(t).select("*").eq("is_active", true).order("type", { ascending: true }).order("sort", { ascending: true });
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
  } catch (e) {
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
  } catch (e) {
    _cache.farms = { ts: now, data: [] };
    return [];
  }
}

app.get("/api/subcategories", async (req, res) => {
  try {
    const rows = await getSubcategoriesSafe();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/farms", async (req, res) => {
  try {
    const rows = await getFarmsSafe();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =========================
// Helpers
// =========================
const allowedTypes = new Set(["hash", "weed", "extraction", "wpff"]);
const micronValues = ["120u", "90u", "73u", "45u"];
const weedKindValues = ["indica", "sativa", "hybrid"];

const isMicron = (v) => micronValues.includes(String(v || "").toLowerCase());
const isWeedKind = (v) => weedKindValues.includes(String(v || "").toLowerCase());

const csvToArr = (str) =>
  (str || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const typeLabel = (t) => ({ hash: "Hash", weed: "Weed", extraction: "Extraction", wpff: "WPFF" }[t] || t);
const weedKindLabel = (k) => ({ indica: "Indica", sativa: "Sativa", hybrid: "Hybrid" }[k] || k);

// =========================
// DB: cards CRUD (normalisé)
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
// FEATURED (Rare du moment)
// =========================
async function dbGetFeatured() {
  assertSupabase();
  return runWithTable(TABLES.cards, async (t) => {
    const isFR = t === "cartes";
    const col = isFR ? "est_mis_en_avant" : "is_featured";
    const { data, error } = await sb.from(t).select("*").eq(col, true).order("id", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return normalizeCardRow(data);
  });
}

async function dbSetFeatured(id, title) {
  assertSupabase();
  return runWithTable(TABLES.cards, async (t) => {
    const isFR = t === "cartes";
    const flag = isFR ? "est_mis_en_avant" : "is_featured";
    const titleCol = isFR ? "titre_vedette" : "featured_title";

    const { error: e1 } = await sb.from(t).update({ [flag]: false, [titleCol]: null }).eq(flag, true);
    if (e1) throw e1;

    const patch = { [flag]: true, [titleCol]: title || "✨ Rare du moment" };
    const { data, error: e2 } = await sb.from(t).update(patch).eq("id", id).select("*").single();
    if (e2) throw e2;

    return normalizeCardRow(data);
  });
}

async function dbUnsetFeatured() {
  assertSupabase();
  return runWithTable(TABLES.cards, async (t) => {
    const isFR = t === "cartes";
    const flag = isFR ? "est_mis_en_avant" : "is_featured";
    const titleCol = isFR ? "titre_vedette" : "featured_title";
    const { error } = await sb.from(t).update({ [flag]: false, [titleCol]: null }).eq(flag, true);
    if (error) throw error;
    return true;
  });
}

// =========================
// PARTNER (Partenaire du moment) — indépendant du Rare
// =========================
async function dbGetPartner() {
  assertSupabase();
  return runWithTable(TABLES.cards, async (t) => {
    const isFR = t === "cartes";
    const col = isFR ? "est_partenaire" : "is_partner";
    const { data, error } = await sb.from(t).select("*").eq(col, true).order("id", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return normalizeCardRow(data);
  });
}

async function dbSetPartner(id, title) {
  assertSupabase();
  return runWithTable(TABLES.cards, async (t) => {
    const isFR = t === "cartes";
    const flag = isFR ? "est_partenaire" : "is_partner";
    const titleCol = isFR ? "titre_partenaire" : "partner_title";

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
    const isFR = t === "cartes";
    const flag = isFR ? "est_partenaire" : "is_partner";
    const titleCol = isFR ? "titre_partenaire" : "partner_title";
    const { error } = await sb.from(t).update({ [flag]: false, [titleCol]: null }).eq(flag, true);
    if (error) throw error;
    return true;
  });
}

// =========================
// API: cards + featured + partner + farms
// =========================
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
    console.error("❌ /api/featured:", e.message);
    res.status(500).json({ error: "db_error", message: e.message });
  }
});

app.get("/api/partner", async (req, res) => {
  try {
    const [c, subs, farms] = await Promise.all([dbGetPartner(), getSubcategoriesSafe(), getFarmsSafe()]);
    if (!c) return res.json(null);
    res.json(enrichCardsWithLabels([c], subs, farms)[0]);
  } catch (e) {
    console.error("❌ /api/partner:", e.message);
    res.status(500).json({ error: "db_error", message: e.message });
  }
});

app.get("/api/farm/:farm_id/cards", async (req, res) => {
  try {
    const farm_id = Number(req.params.farm_id);
    if (!farm_id) return res.status(400).json({ error: "invalid_farm_id" });

    assertSupabase();
    const cards = await runWithTable(TABLES.cards, async (t) => {
      const col = t === "cartes" ? "ferme_id" : "farm_id";
      const { data, error } = await sb.from(t).select("*").eq(col, farm_id).order("id", { ascending: false });
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
// Favorites (Mon Dex)
// =========================
app.post("/api/favorite", async (req, res) => {
  try {
    assertSupabase();
    const { user_id, card_id } = req.body || {};
    if (!user_id || !card_id) return res.status(400).json({ error: "missing user_id/card_id" });

    const favTable = TABLES.favorites;
    const cardsTable = TABLES.cards;

    const existing = await runWithTable(favTable, async (t) => {
      const { data, error } = await sb.from(t).select("id").eq("user_id", user_id).eq("card_id", card_id).maybeSingle();
      if (error) throw error;
      return data;
    });

    if (existing?.id) {
      await runWithTable(favTable, async (t) => {
        const { error } = await sb.from(t).delete().eq("id", existing.id);
        if (error) throw error;
        return true;
      });
      return res.json({ favorited: false });
    } else {
      await runWithTable(favTable, async (t) => {
        const { error } = await sb.from(t).insert({ user_id, card_id });
        if (error) throw error;
        return true;
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

  console.log("✅ Bot en mode WEBHOOK:", `${WEBHOOK_URL}${hookPath}`);
} else {
  bot = new TelegramBot(TOKEN, { polling: true });
  console.log("✅ Bot en mode POLLING (pas recommandé sur Render)");
}

// =========================
// /start menu
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
  const caption = `🧬 *HarvestDex*

Collectionne tes fiches, ajoute-les à *Mon Dex* et explore les catégories 🔥`;

  const keyboard = buildStartKeyboard(userId);

  return bot
    .sendPhoto(chatId, START_IMAGE_URL, {
      caption,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    })
    .catch(() => {
      return bot.sendMessage(chatId, caption, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard },
      });
    });
}

bot.onText(/^\/start$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  sendStartMenu(chatId, userId);
});

// =========================
// ADMIN COMMAND LIST (clean)
// =========================
bot.onText(/^\/myid$/, (msg) => {
  bot.sendMessage(msg.chat.id, `✅ user_id = ${msg.from?.id}\n✅ chat_id = ${msg.chat.id}`);
});

bot.onText(/^\/admin(?:help)?$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  const txt =
`👑 *Commandes Admin*

*Ajout / édition*
• /addform — ajouter une fiche (avec sous-catégorie + farm)
• /edit id — éditer une fiche
• /delete id — supprimer une fiche

*Rare / Legendary*
• /rare id (titre optionnel)
• /unrare
• /rareinfo
• /legendary id (titre optionnel)
• /unlegendary
• /legendaryinfo

*Partenaire du moment*
• /partner id (titre optionnel)
• /unpartner
• /partnerinfo

*Debug*
• /ping
• /stats`;

  return bot.sendMessage(chatId, txt, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "➕ Ajouter (addform)", callback_data: "menu_addform" }],
        [{ text: "✨ Rare du moment", callback_data: "menu_rare" }, { text: "👑 Legendary", callback_data: "menu_legendary" }],
        [{ text: "🤝 Partenaire", callback_data: "menu_partner" }],
        [{ text: "📊 Stats", callback_data: "menu_stats" }],
      ],
    },
  });
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

bot.onText(/^\/stat$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    assertSupabase();
    const { count, error } = await sb.from("track_events").select("*", { count: "exact", head: true });
    if (error) throw error;
    bot.sendMessage(chatId, `📊 *Stats*\n\nTotal events: *${count || 0}*`, { parse_mode: "Markdown" });
  } catch (e) {
    bot.sendMessage(chatId, `❌ /stat: ${e.message}`);
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

    const extra =
      updated.type === "weed"
        ? updated.weed_kind
          ? ` • ${updated.weed_kind}`
          : ""
        : updated.micron
        ? ` • ${updated.micron}`
        : "";

    bot.sendMessage(
      chatId,
      `✨ *Rare du moment activée !*\n\n#${updated.id} — *${updated.name}*\n${typeLabel(updated.type)}${extra}\nTitre: *${updated.featured_title || "✨ Shiny du moment"}*`,
      { parse_mode: "Markdown" }
    );
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
    bot.sendMessage(chatId, "✅ Rare du moment désactivée.");
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

    const extra =
      c.type === "weed"
        ? c.weed_kind
          ? ` • ${c.weed_kind}`
          : ""
        : c.micron
        ? ` • ${c.micron}`
        : "";

    bot.sendMessage(chatId, `✨ Rare actuelle:\n#${c.id} — ${c.name}\n${typeLabel(c.type)}${extra}\nTitre: ${c.featured_title || "✨ Shiny du moment"}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /rareinfo: ${e.message}`);
  }
});


// =========================
// PARTNER commands
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

    bot.sendMessage(
      chatId,
      `🤝 *Partenaire du moment activé !*\n\n#${updated.id} — *${updated.name}*\nTitre: *${updated.partner_title || "🤝 Partenaire du moment"}*`,
      { parse_mode: "Markdown" }
    );
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
    if (!c) return bot.sendMessage(chatId, "ℹ️ Aucun partenaire actif.");
    bot.sendMessage(chatId, `🤝 Partenaire actif: #${c.id} — ${c.name}\nTitre: ${c.partner_title || "🤝 Partenaire du moment"}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /partnerinfo: ${e.message}`);
  }
});


// =========================
// list / edit / del commands
// =========================
bot.onText(/^\/list(?:\s+(\w+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const filter = (match[1] || "").toLowerCase();
    let cards = await dbListCards();

    if (filter) {
      if (allowedTypes.has(filter)) {
        cards = cards.filter((c) => String(c.type || "").toLowerCase() === filter);
      } else if (isMicron(filter)) {
        cards = cards.filter((c) => String(c.micron || "").toLowerCase() === filter);
      } else if (isWeedKind(filter)) {
        cards = cards.filter((c) => String(c.weed_kind || "").toLowerCase() === filter);
      } else {
        return bot.sendMessage(chatId, "❌ Filtre inconnu. Ex: /list weed | /list 90u | /list indica");
      }
    }

    if (!cards.length) return bot.sendMessage(chatId, "Aucune fiche.");

    const lines = cards
      .slice(0, 80)
      .map((c) => {
        const t = String(c.type || "");
        const extra =
          t === "weed" ? (c.weed_kind ? ` • ${c.weed_kind}` : "") : (c.micron ? ` • ${c.micron}` : "");
        return `#${c.id} • ${t}${extra} • ${c.name}`;
      })
      .join("\n");

    bot.sendMessage(chatId, `📚 Fiches (${cards.length})\n\n${lines}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ /list: ${e.message}`);
  }
});

bot.onText(/^\/del\s+(\d+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

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
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const id = Number(match[1]);
    const field = match[2].toLowerCase();
    const value = (match[3] || "").trim();

    const allowedFields = new Set([
      "name","type","micron","weed_kind","thc","description","img","advice","terpenes","aroma","effects",
    ]);
    if (!allowedFields.has(field)) return bot.sendMessage(chatId, "❌ Champ invalide.");

    const card = await dbGetCard(id);
    if (!card) return bot.sendMessage(chatId, "❌ ID introuvable.");

    const patch = {};

    if (field === "type") {
      const newType = value.toLowerCase();
      if (!allowedTypes.has(newType)) return bot.sendMessage(chatId, "❌ type invalide: hash|weed|extraction|wpff");
      patch.type = newType;

      if (newType === "weed") {
        patch.micron = null;
        patch.weed_kind = card.weed_kind || "hybrid";
      } else {
        patch.weed_kind = null;
      }
    } else if (field === "micron") {
      const v = value === "-" ? null : value.toLowerCase();
      if (v && !isMicron(v)) return bot.sendMessage(chatId, "❌ micron invalide: 120u|90u|73u|45u (ou `-`)");
      if (String(card.type).toLowerCase() === "weed") return bot.sendMessage(chatId, "❌ Weed n'a pas de micron.");
      patch.micron = v;
    } else if (field === "weed_kind") {
      const v = value === "-" ? null : value.toLowerCase();
      if (v && !isWeedKind(v)) return bot.sendMessage(chatId, "❌ weed_kind invalide: indica|sativa|hybrid (ou `-`)");
      if (String(card.type).toLowerCase() !== "weed") return bot.sendMessage(chatId, "❌ weed_kind seulement pour weed.");
      patch.weed_kind = v || "hybrid";
    } else if (["terpenes","aroma","effects"].includes(field)) {
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

// =========================
// Wizards (add/edit/del form)
// =========================
const addWizard = new Map();
const editWizard = new Map();
const delWizard = new Map();

function addCancel(chatId) {
  addWizard.delete(chatId);
  bot.sendMessage(chatId, "❌ Ajout annulé.");
}
function editCancel(chatId) {
  editWizard.delete(chatId);
  bot.sendMessage(chatId, "❌ Modification annulée.");
}
function delCancel(chatId) {
  delWizard.delete(chatId);
  bot.sendMessage(chatId, "❌ Suppression annulée.");
}

function askType(chatId) {
  bot.sendMessage(chatId, "2/12 — Choisis la *catégorie* :", {
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
  bot.sendMessage(chatId, "3/12 — Choisis le *micron* :", {
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

function askWeedKind(chatId) {
  bot.sendMessage(chatId, "3/12 — Choisis *indica / sativa / hybrid* :", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "Indica", callback_data: "add_weedkind_indica" }, { text: "Sativa", callback_data: "add_weedkind_sativa" }],
        [{ text: "Hybrid", callback_data: "add_weedkind_hybrid" }],
        [{ text: "❌ Annuler", callback_data: "add_cancel" }],
      ],
    },
  });
}


async function askSubcategory(chatId, type) {
  const t = String(type || "").toLowerCase();
  const subs = (await getSubcategoriesSafe()).filter((s) => String(s.type).toLowerCase() === t);

  const buttons = [];
  const chunks = subs.slice(0, 24); // sécurité
  for (let i = 0; i < chunks.length; i += 2) {
    const row = [];
    row.push({ text: chunks[i].label, callback_data: `add_sub_${chunks[i].id}` });
    if (chunks[i + 1]) row.push({ text: chunks[i + 1].label, callback_data: `add_sub_${chunks[i + 1].id}` });
    buttons.push(row);
  }
  buttons.push([{ text: "Aucune", callback_data: "add_sub_none" }]);
  buttons.push([{ text: "❌ Annuler", callback_data: "add_cancel" }]);

  bot.sendMessage(chatId, "4/12 — Choisis la *sous-catégorie* :", {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function askFarm(chatId) {
  const farms = await getFarmsSafe();
  const buttons = [];

  // affiche les 20 premières (triées)
  const list = farms.slice(0, 20);
  for (let i = 0; i < list.length; i += 2) {
    const row = [];
    row.push({ text: list[i].name, callback_data: `add_farm_${list[i].id}` });
    if (list[i + 1]) row.push({ text: list[i + 1].name, callback_data: `add_farm_${list[i + 1].id}` });
    buttons.push(row);
  }

  buttons.push([{ text: "➕ Nouvelle farm", callback_data: "add_farm_new" }]);
  buttons.push([{ text: "Aucune", callback_data: "add_farm_none" }]);
  buttons.push([{ text: "❌ Annuler", callback_data: "add_cancel" }]);

  bot.sendMessage(chatId, "5/12 — Choisis la *farm* (ou crée-la) :", {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function addFinish(chatId) {
  const state = addWizard.get(chatId);
  if (!state) return;
  const d = state.data;

  const t = String(d.type || "").toLowerCase();

  const payload = {
    name: d.name,
    type: t,
    thc: d.thc || "—",
    description: d.description || "—",
    img: d.img || "",
    terpenes: csvToArr(d.terpenes || ""),
    aroma: csvToArr(d.aroma || ""),
    effects: csvToArr(d.effects || ""),
    advice: d.advice || "Info éducative. Les effets varient selon la personne. Respecte la loi.",
    subcategory_id: d.subcategory_id || null,
    farm_id: d.farm_id || null,
    micron: null,
    weed_kind: null,
  };

  if (t === "weed") {
    payload.weed_kind = d.weed_kind || "hybrid";
    payload.micron = null;
  } else {
    payload.micron = d.micron || null;
    payload.weed_kind = null;
  }

  const card = await dbInsertCard(payload);
  const subs = await getSubcategoriesSafe();
  const farms = await getFarmsSafe();
  const sc = card.subcategory_id != null ? subs.find((s) => String(s.id) === String(card.subcategory_id)) : null;
  const fm = card.farm_id != null ? farms.find((f) => String(f.id) === String(card.farm_id)) : null;

  addWizard.delete(chatId);

  const extra =
    card.type === "weed"
      ? card.weed_kind
        ? ` • ${weedKindLabel(card.weed_kind)}`
        : ""
      : card.micron
      ? ` • ${card.micron}`
      : "";

  const msg =
    `✅ *Fiche ajoutée !*\n\n` +
    `#${card.id} — *${card.name}*\n` +
    `Catégorie: *${typeLabel(card.type)}${extra}*\n` +
    `${sc ? `Sous-catégorie: *${sc.label}*\n` : ""}` +
    `${fm ? `Farm: *${fm.name}*\n` : ""}` +
    `${card.thc}\n\n` +
    `🧬 ${card.description}\n` +
    `🌿 Terpènes: ${card.terpenes?.length ? card.terpenes.join(", ") : "—"}\n` +
    `👃 Arômes: ${card.aroma?.length ? card.aroma.join(", ") : "—"}\n` +
    `🧠 Effets: ${card.effects?.length ? card.effects.join(", ") : "—"}\n` +
    `⚠️ ${card.advice}`;

  bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
}

bot.onText(/^\/addform$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  addWizard.set(chatId, { step: "name", data: {} });
  bot.sendMessage(
    chatId,
    "📝 *Ajout d'une fiche* (formulaire)\n\n1/12 — Envoie le *nom*.\nEx: `Static Hash Premium`",
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "add_cancel" }]] },
    }
  );
});

bot.onText(/^\/editform$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const cards = await dbListCards();
    if (!cards.length) return bot.sendMessage(chatId, "Aucune fiche à modifier.");

    const buttons = cards.slice(0, 30).map((c) => [{ text: `#${c.id} ${c.name}`, callback_data: `edit_pick_${c.id}` }]);
    buttons.push([{ text: "❌ Annuler", callback_data: "edit_cancel" }]);

    bot.sendMessage(chatId, "🛠️ Choisis la fiche à modifier :", { reply_markup: { inline_keyboard: buttons } });
  } catch (e) {
    bot.sendMessage(chatId, `❌ /editform: ${e.message}`);
  }
});

bot.onText(/^\/delform$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const cards = await dbListCards();
    if (!cards.length) return bot.sendMessage(chatId, "Aucune fiche à supprimer.");

    const buttons = cards.slice(0, 30).map((c) => [{ text: `🗑️ #${c.id} ${c.name}`, callback_data: `del_pick_${c.id}` }]);
    buttons.push([{ text: "❌ Annuler", callback_data: "del_cancel" }]);

    bot.sendMessage(chatId, "🗑️ Choisis la fiche à supprimer :", { reply_markup: { inline_keyboard: buttons } });
  } catch (e) {
    bot.sendMessage(chatId, `❌ /delform: ${e.message}`);
  }
});

// =========================
// SINGLE callback_query handler (menus + wizards)
// =========================
bot.on("callback_query", async (query) => {
  const chatId = query?.message?.chat?.id;
  const userId = query?.from?.id;
  const data = query?.data || "";

  if (!chatId) return;

  try {
    await bot.answerCallbackQuery(query.id);
  } catch {}

  // ===== MENUS =====
  if (data === "menu_back") return sendStartMenu(chatId, userId);

  if (data === "menu_info") {
    const caption =
      `ℹ️ *Informations*\n\n` +
      `HarvestDex est un projet éducatif.\n` +
      `Tu peux consulter les fiches, les terpènes, les arômes et les effets.\n\n` +
      `⚠️ *Disclaimer*\n` +
      `• Aucune vente ici.\n` +
      `• Informations uniquement.\n` +
      `• Les effets varient selon la personne.\n` +
      `• Respecte les lois de ton pays.\n\n` +
      `📌 Weed: indica/sativa/hybrid (dans la fiche)\n` +
      `📌 Hash/Extraction/WPFF: détails (microns et infos) dans la fiche`;

    return bot.sendPhoto(chatId, INFO_IMAGE_URL, {
      caption,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_back" }]] },
    });
  }

  if (data === "menu_support") {
    const caption = `🤝 *Nous soutenir*\n\nChoisis une option 👇`;

    return bot.sendPhoto(chatId, SUPPORT_IMAGE_URL, {
      caption,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📲 Nous suivre", callback_data: "support_follow" }],
          [{ text: "🎮 Jouer", callback_data: "support_play" }],
          [{ text: "💸 Don", callback_data: "support_donate" }],
          [{ text: "🤝 Nos partenaires", callback_data: "support_partners" }],
          [{ text: "⬅️ Retour", callback_data: "menu_back" }],
        ],
      },
    });
  }

  if (data === "support_partners") {
    return bot.sendMessage(
      chatId,
      `🤝 *Nos partenaires*\n\nAucun partenaire pour le moment.\nVeuillez nous contacter si vous voulez apparaître ici.`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] },
      }
    );
  }

  if (data === "support_follow") {
    return bot.sendMessage(chatId, "📲 Nous suivre : (mets tes liens ici)", {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] },
    });
  }

  if (data === "support_play") {
    return bot.sendMessage(chatId, "🎮 Jouer : (mets tes jeux/liens ici)", {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] },
    });
  }

  if (data === "support_donate") {
    return bot.sendMessage(chatId, "💸 Don : (mets ton lien TWINT/crypto/etc ici)", {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_support" }]] },
    });
  }

  if (data === "menu_admin") {
    if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");
    return bot.sendMessage(chatId, "🧰 Admin: tape /admin pour voir toutes les commandes.", {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_back" }]] },
    });
  
  if (data === "menu_addform") {
    if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");
    return bot.sendMessage(chatId, "➕ Pour ajouter une fiche : utilise /addform (assistant guidé).");
  }

  if (data === "menu_rare") {
    if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");
    return bot.sendMessage(chatId, `✨ Rare du moment :\n• /rare id (titre optionnel)\n• /unrare\n• /rareinfo`);
  }

  if (data === "menu_legendary") {
    if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");
    return bot.sendMessage(chatId, `👑 Legendary :\n• /legendary id (titre optionnel)\n• /unlegendary\n• /legendaryinfo`);
  }

  if (data === "menu_partner") {
    if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");
    return bot.sendMessage(chatId, `🤝 Partenaire du moment :\n• /partner id (titre optionnel)\n• /unpartner\n• /partnerinfo`);
  }

  if (data === "menu_stats") {
    if (!isAdminUser(userId)) return bot.sendMessage(chatId, "⛔ Pas autorisé.");
    return bot.sendMessage(chatId, "📊 Stats : /stats");
  }

}

  // ===== WIZARDS =====
  if (isAdminUser(userId) && data === "add_cancel") return addCancel(chatId);

  if (isAdminUser(userId) && data.startsWith("add_type_")) {
    const state = addWizard.get(chatId);
    if (!state) return;

    const t = data.replace("add_type_", "");
    if (!allowedTypes.has(t)) return;

    state.data.type = t;

    if (t === "weed") {
      state.step = "weed_kind";
      addWizard.set(chatId, state);
      return askWeedKind(chatId);
    } else {
      state.step = "micron";
      addWizard.set(chatId, state);
      return askMicron(chatId);
    }
  }

  if (isAdminUser(userId) && data.startsWith("add_weedkind_")) {
    const state = addWizard.get(chatId);
    if (!state) return;

    const k = data.replace("add_weedkind_", "");
    if (!isWeedKind(k)) return;

    state.data.weed_kind = k;
    state.data.micron = "";
    state.step = "subcategory";
    addWizard.set(chatId, state);

    return askSubcategory(chatId, state.data.type);
  }

  if (isAdminUser(userId) && data.startsWith("add_micron_")) {
    const state = addWizard.get(chatId);
    if (!state) return;

    const m = data.replace("add_micron_", "");
    state.data.micron = m === "none" ? "" : m;
    state.data.weed_kind = null;
    state.step = "subcategory";
    addWizard.set(chatId, state);

    return askSubcategory(chatId, state.data.type);
  }

  
  if (isAdminUser(userId) && (data === "add_sub_none" || data.startsWith("add_sub_"))) {
    const state = addWizard.get(chatId);
    if (!state) return;

    const sc = data === "add_sub_none" ? null : data.replace("add_sub_", "");
    state.data.subcategory_id = sc || null;
    state.step = "farm";
    addWizard.set(chatId, state);

    return askFarm(chatId);
  }

  if (isAdminUser(userId) && data === "add_farm_none") {
    const state = addWizard.get(chatId);
    if (!state) return;

    state.data.farm_id = null;
    state.step = "thc";
    addWizard.set(chatId, state);

    return bot.sendMessage(chatId, "6/12 — Envoie le *THC* (ex: `THC: 35–55%`).", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "add_cancel" }]] },
    });
  }

  if (isAdminUser(userId) && data === "add_farm_new") {
    const state = addWizard.get(chatId);
    if (!state) return;

    state.step = "farm_name";
    addWizard.set(chatId, state);

    return bot.sendMessage(chatId, "5/12 — Envoie le *nom de la farm*.", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "add_cancel" }]] },
    });
  }

  if (isAdminUser(userId) && data.startsWith("add_farm_")) {
    const state = addWizard.get(chatId);
    if (!state) return;

    const fid = Number(data.replace("add_farm_", ""));
    state.data.farm_id = fid || null;
    state.step = "thc";
    addWizard.set(chatId, state);

    return bot.sendMessage(chatId, "6/12 — Envoie le *THC* (ex: `THC: 35–55%`).", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "add_cancel" }]] },
    });
  }

if (isAdminUser(userId) && data === "edit_cancel") return editCancel(chatId);
  if (isAdminUser(userId) && data === "del_cancel") return delCancel(chatId);

  if (isAdminUser(userId) && data.startsWith("del_pick_")) {
    try {
      const id = Number(data.replace("del_pick_", ""));
      const card = await dbGetCard(id);
      if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");

      delWizard.set(chatId, { id });

      const extra =
        card.type === "weed"
          ? card.weed_kind
            ? ` • ${card.weed_kind}`
            : ""
          : card.micron
          ? ` • ${card.micron}`
          : "";

      return bot.sendMessage(chatId, `⚠️ Confirme la suppression :\n\n#${card.id} — ${card.name}\n(${card.type}${extra})`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ CONFIRMER", callback_data: `del_confirm_${id}` }],
            [{ text: "❌ Annuler", callback_data: "del_cancel" }],
          ],
        },
      });
    } catch (e) {
      return bot.sendMessage(chatId, `❌ del_pick: ${e.message}`);
    }
  }

  if (isAdminUser(userId) && data.startsWith("del_confirm_")) {
    try {
      const id = Number(data.replace("del_confirm_", ""));
      const st = delWizard.get(chatId);
      if (!st || st.id !== id) return bot.sendMessage(chatId, "❌ Relance /delform.");

      await dbDeleteCard(id);
      delWizard.delete(chatId);
      return bot.sendMessage(chatId, `🗑️ Supprimé: #${id}`);
    } catch (e) {
      return bot.sendMessage(chatId, `❌ del_confirm: ${e.message}`);
    }
  }

  if (isAdminUser(userId) && data.startsWith("edit_pick_")) {
    try {
      const id = Number(data.replace("edit_pick_", ""));
      const card = await dbGetCard(id);
      if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");

      const isWeed = String(card.type).toLowerCase() === "weed";
      const line2 = isWeed
        ? [
            { text: "Weed Kind", callback_data: `edit_field_${id}_weed_kind` },
            { text: "THC", callback_data: `edit_field_${id}_thc` },
          ]
        : [
            { text: "Micron", callback_data: `edit_field_${id}_micron` },
            { text: "THC", callback_data: `edit_field_${id}_thc` },
          ];

      return bot.sendMessage(chatId, `✅ Fiche sélectionnée: #${id}\nChoisis le champ :`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Nom", callback_data: `edit_field_${id}_name` }, { text: "Type", callback_data: `edit_field_${id}_type` }],
            line2,
            [{ text: "Description", callback_data: `edit_field_${id}_description` }, { text: "Image", callback_data: `edit_field_${id}_img` }],
            [{ text: "Terpènes", callback_data: `edit_field_${id}_terpenes` }, { text: "Arômes", callback_data: `edit_field_${id}_aroma` }],
            [{ text: "Effets", callback_data: `edit_field_${id}_effects` }, { text: "Conseils", callback_data: `edit_field_${id}_advice` }],
            [{ text: "❌ Annuler", callback_data: "edit_cancel" }],
          ],
        },
      });
    } catch (e) {
      return bot.sendMessage(chatId, `❌ edit_pick: ${e.message}`);
    }
  }

  if (isAdminUser(userId) && data.startsWith("edit_field_")) {
    const parts = data.split("_");
    const id = Number(parts[2]);
    const field = parts.slice(3).join("_");

    if (field === "type") {
      return bot.sendMessage(chatId, `🔁 Nouveau type pour #${id} :`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Hash", callback_data: `edit_settype_${id}_hash` }, { text: "Weed", callback_data: `edit_settype_${id}_weed` }],
            [{ text: "Extraction", callback_data: `edit_settype_${id}_extraction` }, { text: "WPFF", callback_data: `edit_settype_${id}_wpff` }],
            [{ text: "❌ Annuler", callback_data: "edit_cancel" }],
          ],
        },
      });
    }

    if (field === "micron") {
      return bot.sendMessage(chatId, `🔁 Nouveau micron pour #${id} :`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "120u", callback_data: `edit_setmicron_${id}_120u` }, { text: "90u", callback_data: `edit_setmicron_${id}_90u` }],
            [{ text: "73u", callback_data: `edit_setmicron_${id}_73u` }, { text: "45u", callback_data: `edit_setmicron_${id}_45u` }],
            [{ text: "Aucun", callback_data: `edit_setmicron_${id}_none` }],
            [{ text: "❌ Annuler", callback_data: "edit_cancel" }],
          ],
        },
      });
    }

    if (field === "weed_kind") {
      return bot.sendMessage(chatId, `🔁 Nouveau weed_kind pour #${id} :`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Indica", callback_data: `edit_setweedkind_${id}_indica` }, { text: "Sativa", callback_data: `edit_setweedkind_${id}_sativa` }],
            [{ text: "Hybrid", callback_data: `edit_setweedkind_${id}_hybrid` }],
            [{ text: "❌ Annuler", callback_data: "edit_cancel" }],
          ],
        },
      });
    }

    editWizard.set(chatId, { id, field, step: "value" });

    return bot.sendMessage(
      chatId,
      `✍️ Envoie la nouvelle valeur pour *${field}* (ou \`-\` pour vider).` +
        (["terpenes", "aroma", "effects"].includes(field) ? "\nFormat: `a,b,c`" : ""),
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "❌ Annuler", callback_data: "edit_cancel" }]] },
      }
    );
  }

  if (isAdminUser(userId) && data.startsWith("edit_settype_")) {
    try {
      const parts = data.split("_");
      const id = Number(parts[2]);
      const newType = parts[3];
      if (!allowedTypes.has(newType)) return bot.sendMessage(chatId, "❌ Type invalide.");

      const card = await dbGetCard(id);
      if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");

      const patch = { type: newType };

      if (newType === "weed") {
        patch.micron = null;
        patch.weed_kind = card.weed_kind || "hybrid";
      } else {
        patch.weed_kind = null;
      }

      await dbUpdateCard(id, patch);
      return bot.sendMessage(chatId, `✅ Type mis à jour: #${id} → ${newType}`);
    } catch (e) {
      return bot.sendMessage(chatId, `❌ settype: ${e.message}`);
    }
  }

  if (isAdminUser(userId) && data.startsWith("edit_setmicron_")) {
    try {
      const parts = data.split("_");
      const id = Number(parts[2]);
      const micron = parts[3];
      const m = micron === "none" ? null : micron;
      if (m && !isMicron(m)) return bot.sendMessage(chatId, "❌ Micron invalide.");

      const card = await dbGetCard(id);
      if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");
      if (String(card.type).toLowerCase() === "weed") return bot.sendMessage(chatId, "❌ Weed n'a pas de micron.");

      await dbUpdateCard(id, { micron: m });
      return bot.sendMessage(chatId, `✅ Micron mis à jour: #${id} → ${m || "Aucun"}`);
    } catch (e) {
      return bot.sendMessage(chatId, `❌ setmicron: ${e.message}`);
    }
  }

  if (isAdminUser(userId) && data.startsWith("edit_setweedkind_")) {
    try {
      const parts = data.split("_");
      const id = Number(parts[2]);
      const k = parts[3];
      if (!isWeedKind(k)) return bot.sendMessage(chatId, "❌ weed_kind invalide.");

      const card = await dbGetCard(id);
      if (!card) return bot.sendMessage(chatId, "❌ Fiche introuvable.");
      if (String(card.type).toLowerCase() !== "weed") return bot.sendMessage(chatId, "❌ weed_kind uniquement pour weed.");

      await dbUpdateCard(id, { weed_kind: k, micron: null });
      return bot.sendMessage(chatId, `✅ Weed_kind mis à jour: #${id} → ${weedKindLabel(k)}`);
    } catch (e) {
      return bot.sendMessage(chatId, `❌ setweedkind: ${e.message}`);
    }
  }
});

// =========================
// Text steps (ADD + EDIT value)
// =========================
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const text = (msg.text || "").trim();

  if (!isAdminUser(userId)) return;
  if (text.startsWith("/")) return;

  const addState = addWizard.get(chatId);
  if (addState) {
    if (addState.step === "name") {
      addState.data.name = text;
      addState.step = "type";
      addWizard.set(chatId, addState);
      return askType(chatId);
    }

    if (addState.step === "farm_name") {
      addState.data.farm_name = text;
      addState.step = "farm_country";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "6/12 — Pays (ex: `Suisse`) ou `-`", { parse_mode: "Markdown" });
    }

    if (addState.step === "farm_country") {
      addState.data.farm_country = text === "-" ? "" : text;
      addState.step = "farm_instagram";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "7/12 — Instagram (username ou URL) ou `-`", { parse_mode: "Markdown" });
    }

    if (addState.step === "farm_instagram") {
      addState.data.farm_instagram = text === "-" ? "" : text;
      addState.step = "farm_website";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "8/12 — Website (URL) ou `-`", { parse_mode: "Markdown" });
    }

    if (addState.step === "farm_website") {
      addState.data.farm_website = text === "-" ? "" : text;

      try {
        const payload = {
          name: addState.data.farm_name,
          country: addState.data.farm_country || null,
          instagram: addState.data.farm_instagram || null,
          website: addState.data.farm_website || null,
          is_active: true,
        };
        const created = await dbInsertFarm(payload);

        // update cache to show it immediately next time
        _cache.farms = { ts: Date.now(), data: [...(_cache.farms.data || []), created] };

        addState.data.farm_id = created.id;
        addState.step = "thc";
        addWizard.set(chatId, addState);

        return bot.sendMessage(chatId, "9/12 — Envoie le *THC* (ex: `THC: 35–55%`).", { parse_mode: "Markdown" });
      } catch (e) {
        addWizard.delete(chatId);
        return bot.sendMessage(chatId, `❌ Création farm KO: ${e.message}`);
      }
    }


    if (addState.step === "thc") {
      addState.data.thc = text;
      addState.step = "description";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "7/12 — Envoie la *description*.", { parse_mode: "Markdown" });
    }

    if (addState.step === "description") {
      addState.data.description = text;
      addState.step = "terpenes";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "8/12 — Terpènes (virgules) ou `-`", { parse_mode: "Markdown" });
    }

    if (addState.step === "terpenes") {
      addState.data.terpenes = text === "-" ? "" : text;
      addState.step = "aroma";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "9/12 — Arômes (virgules) ou `-`", { parse_mode: "Markdown" });
    }

    if (addState.step === "aroma") {
      addState.data.aroma = text === "-" ? "" : text;
      addState.step = "effects";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "10/12 — Effets (virgules) ou `-`", { parse_mode: "Markdown" });
    }

    if (addState.step === "effects") {
      addState.data.effects = text === "-" ? "" : text;
      addState.step = "advice";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "11/12 — Conseils / warning", { parse_mode: "Markdown" });
    }

    if (addState.step === "advice") {
      addState.data.advice = text;
      addState.step = "img";
      addWizard.set(chatId, addState);
      return bot.sendMessage(chatId, "12/12 — Image URL (ou `-`)", { parse_mode: "Markdown" });
    }

    if (addState.step === "img") {
      addState.data.img = text === "-" ? "" : text;
      try {
        return await addFinish(chatId);
      } catch (e) {
        addWizard.delete(chatId);
        return bot.sendMessage(chatId, `❌ Ajout KO: ${e.message}`);
      }
    }
  }

  const ed = editWizard.get(chatId);
  if (ed && ed.step === "value") {
    try {
      const { id, field } = ed;
      const val = text === "-" ? "" : text;

      const card = await dbGetCard(id);
      if (!card) throw new Error("Fiche introuvable.");

      const patch = {};

      if (["terpenes", "aroma", "effects"].includes(field)) {
        patch[field] = val ? csvToArr(val) : [];
      } else if (field === "micron") {
        if (String(card.type).toLowerCase() === "weed") throw new Error("Weed n'a pas de micron.");
        if (val && !isMicron(val)) throw new Error("micron invalide");
        patch.micron = val ? val.toLowerCase() : null;
      } else if (field === "weed_kind") {
        if (String(card.type).toLowerCase() !== "weed") throw new Error("weed_kind uniquement pour weed.");
        if (val && !isWeedKind(val)) throw new Error("weed_kind invalide");
        patch.weed_kind = val ? val.toLowerCase() : "hybrid";
        patch.micron = null;
      } else if (field === "type") {
        const v = val.toLowerCase();
        if (v && !allowedTypes.has(v)) throw new Error("type invalide");
        patch.type = v;

        if (v === "weed") {
          patch.micron = null;
          patch.weed_kind = card.weed_kind || "hybrid";
        } else {
          patch.weed_kind = null;
        }
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

// =========================
// Start server last
// =========================
app.listen(PORT, () => console.log("Serveur PokéTerps lancé sur le port", PORT));
