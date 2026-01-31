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
// Telegram: POLLING ONLY (comme avant)
// =========================
const bot = new TelegramBot(TOKEN, { polling: true });
console.log("✅ Bot en mode POLLING");

// Hard guards (Render)
bot.on("polling_error", (err) => {
  console.error("❌ polling_error:", err?.message || err);
});
process.on("unhandledRejection", (err) => console.error("⚠️ Rejet non géré :", err?.message || err));
process.on("uncaughtException", (err) => console.error("⚠️ Exception non gérée :", err?.message || err));

// =========================
// Safe send helpers (évite crash parse entities)
// =========================
function stripParseMode(opts = {}) {
  const o = { ...(opts || {}) };
  delete o.parse_mode;
  return o;
}
async async function safeSendMessage(chatId, text, opts) {
  try {
    return await bot.sendMessage(chatId, text, opts);
  } catch (e) {
    const msg = String(e?.message || "");
    // si Markdown/HTML casse -> renvoyer sans parse_mode
    if (msg.toLowerCase().includes("can't parse entities") || msg.toLowerCase().includes("impossible d'analyser")) {
      try {
        return await bot.sendMessage(chatId, text, stripParseMode(opts));
      } catch (e2) {
        console.error("❌ sendMessage retry failed:", e2?.message || e2);
        return null;
      }
    }
    console.error("❌ sendMessage failed:", msg);
    return null;
  }
}
async async function safeSendPhoto(chatId, photo, opts) {
  try {
    return await bot.sendPhoto(chatId, photo, opts);
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.toLowerCase().includes("can't parse entities") || msg.toLowerCase().includes("impossible d'analyser")) {
      try {
        return await bot.sendPhoto(chatId, photo, stripParseMode(opts));
      } catch (e2) {
        console.error("❌ sendPhoto retry failed:", e2?.message || e2);
        return null;
      }
    }
    console.error("❌ sendPhoto failed:", msg);
    return null;
  }
}

// =========================
// Admin
// =========================
const ADMIN_IDS = new Set([6675436692]); // ✅ TON USER ID
const isAdminUser = (userId) => ADMIN_IDS.has(Number(userId));

// =========================
// DB: compat FR/EN (tables + colonnes)
// =========================
const TABLES = {
  cards: ["cartes", "cards"],
  favorites: ["favoris", "favorites"],
  farms: ["fermes", "farms"],
  subcategories: ["subcategories", "sous-catégories", "sous_categories", "sous-categories"],
  track: ["track_events", "trackevent", "events"],
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
// Cache simple
// =========================
const _cache = { subcategories: { ts: 0, data: [] }, farms: { ts: 0, data: [] } };
const CACHE_TTL_MS = 60_000;

// =========================
// DB: reads
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
  try { res.json(await getSubcategoriesSafe()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/farms", async (req, res) => {
  try { res.json(await getFarmsSafe()); } catch (e) { res.status(500).json({ error: e.message }); }
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
// FEATURED + PARTNER
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
// Enrich labels
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
      farm: farm ? { id: farm.id, name: farm.name, country: farm.country, instagram: farm.instagram, website: farm.website } : null,
    };
  });
}

// =========================
// API: cards / featured / partner
// =========================
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
// Track events (views/clicks)
// =========================
async function dbInsertTrackEvent(payload) {
  assertSupabase();
  return runWithTable(TABLES.track, async (t) => {
    const { data, error } = await sb.from(t).insert(payload).select("*").maybeSingle();
    if (error) throw error;
    return data || null;
  });
}

app.post("/api/track", async (req, res) => {
  try {
    assertSupabase();
    const { user_id, card_id, event_type } = req.body || {};
    if (!card_id) return res.status(400).json({ error: "missing card_id" });
    const row = {
      user_id: user_id ?? null,
      card_id: Number(card_id),
      event_type: event_type || "view",
      created_at: new Date().toISOString(),
    };
    try { await dbInsertTrackEvent(row); } catch (e) { /* ignore if schema differs */ }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =========================
// Stats endpoints
// =========================
function isoDaysAgo(days) {
  const d = new Date(Date.now() - Number(days) * 86400 * 1000);
  return d.toISOString();
}

async function fetchTrackCounts(days) {
  // returns Map(card_id => count)
  const since = isoDaysAgo(days);
  try {
    const rows = await runWithTable(TABLES.track, async (t) => {
      // try standard columns
      const { data, error } = await sb.from(t).select("card_id, event_type, created_at").gte("created_at", since);
      if (error) throw error;
      return data || [];
    });
    const m = new Map();
    for (const r of rows) {
      const cid = r.card_id;
      if (!cid) continue;
      if (r.event_type && String(r.event_type) !== "view" && String(r.event_type) !== "click") continue;
      m.set(String(cid), (m.get(String(cid)) || 0) + 1);
    }
    return m;
  } catch {
    return new Map();
  }
}

async function fetchFavoriteCounts() {
  try {
    const rows = await runWithTable(TABLES.favorites, async (t) => {
      const { data, error } = await sb.from(t).select("card_id");
      if (error) throw error;
      return data || [];
    });
    const m = new Map();
    for (const r of rows) {
      const cid = r.card_id;
      if (!cid) continue;
      m.set(String(cid), (m.get(String(cid)) || 0) + 1);
    }
    return m;
  } catch {
    return new Map();
  }
}

function topByScore(cards, scoreMap, limit) {
  const arr = (cards || []).map(c => ({ c, s: scoreMap.get(String(c.id)) || 0 }))
    .sort((a,b)=> b.s - a.s)
    .slice(0, limit)
    .map(x => x.c);
  return arr;
}

app.get("/api/stats/popular", async (req, res) => {
  try {
    assertSupabase();
    const limit = Math.min(Number(req.query.limit || 8), 20);
    const [cards, subs, farms, favMap, views30] = await Promise.all([
      dbListCards(),
      getSubcategoriesSafe(),
      getFarmsSafe(),
      fetchFavoriteCounts(),
      fetchTrackCounts(30),
    ]);

    const score = new Map();
    for (const c of cards) {
      const id = String(c.id);
      const fav = favMap.get(id) || 0;
      const views = views30.get(id) || 0;
      score.set(id, fav * 3 + views); // pondération légère
    }

    const top = topByScore(cards, score, limit);
    res.json(enrichCardsWithLabels(top, subs, farms));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/stats/trending", async (req, res) => {
  try {
    assertSupabase();
    const days = Math.max(1, Math.min(Number(req.query.days || 7), 30));
    const limit = Math.min(Number(req.query.limit || 8), 20);
    const [cards, subs, farms, views] = await Promise.all([
      dbListCards(),
      getSubcategoriesSafe(),
      getFarmsSafe(),
      fetchTrackCounts(days),
    ]);
    const top = topByScore(cards, views, limit);
    res.json(enrichCardsWithLabels(top, subs, farms));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/stats/new", async (req, res) => {
  try {
    assertSupabase();
    const limit = Math.min(Number(req.query.limit || 8), 20);
    const [cards, subs, farms] = await Promise.all([dbListCards(), getSubcategoriesSafe(), getFarmsSafe()]);
    // proxy: id DESC
    const top = [...cards].sort((a,b)=> (Number(b.id)||0)-(Number(a.id)||0)).slice(0, limit);
    res.json(enrichCardsWithLabels(top, subs, farms));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =========================
// Telegram /start menu
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

  return safeSendPhoto(chatId, START_IMAGE_URL, {
    caption,
    reply_markup: { inline_keyboard: keyboard },
  }).then((r) => {
    if (r) return r;
    return safeSendMessage(chatId, caption, { reply_markup: { inline_keyboard: keyboard } });
  });
}

bot.onText(/^\/start$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  sendStartMenu(chatId, userId);
});

bot.onText(/^\/myid$/, (msg) => {
  safeSendMessage(msg.chat.id, `✅ user_id = ${msg.from?.id}\n✅ chat_id = ${msg.chat.id}`);
});

// =========================
// Admin help message (1 source of truth)
// =========================
function adminHelpText() {
  return (
`👑 Commandes Admin

Ajout / édition
• /addform — ajouter une fiche (sous-catégorie + farm)
• /editform — modifier via menus
• /delform — supprimer via menus
• /edit <id> <champ> <valeur> — édition rapide
• /del <id> — suppression rapide
• /list (option: weed|hash|extraction|wpff|90u|indica...)

Rare / Legendary
• /rare <id> (titre optionnel)
• /unrare
• /rareinfo
(legendary: si tu l'as, on peut l'ajouter pareil)

Partenaire du moment
• /partner <id> (titre optionnel)
• /unpartner
• /partnerinfo

Debug
• /dbtest
• /myid`
  );
}

bot.onText(/^\/adminhelp$|^\/admin$|^\/adminhelp(?:@.+)?$/i, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");

  const txt = adminHelpText();
  return safeSendMessage(chatId, txt, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "➕ Ajouter (addform)", callback_data: "menu_addform" }],
        [{ text: "✨ Rare", callback_data: "menu_rare" }, { text: "🤝 Partenaire", callback_data: "menu_partner" }],
      ],
    },
  });
});

// =========================
// Rare + Partner commands (inchangés mais sans Markdown)
// =========================
bot.onText(/^\/rare\s+(\d+)(?:\s+([\s\S]+))?$/m, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");

  try {
    const id = Number(match[1]);
    const title = (match[2] || "").trim();
    const card = await dbGetCard(id);
    if (!card) return safeSendMessage(chatId, "❌ ID introuvable.");
    const updated = await dbSetFeatured(id, title || "✨ Rare du moment");
    safeSendMessage(chatId, `✅ Rare activée: #${updated.id} — ${updated.name}\nTitre: ${updated.featured_title || "✨ Rare du moment"}`);
  } catch (e) {
    safeSendMessage(chatId, `❌ /rare: ${e.message}`);
  }
});
bot.onText(/^\/unrare$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");
  try { await dbUnsetFeatured(); safeSendMessage(chatId, "✅ Rare désactivée."); } catch (e) { safeSendMessage(chatId, `❌ /unrare: ${e.message}`); }
});
bot.onText(/^\/rareinfo$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");
  try {
    const c = await dbGetFeatured();
    if (!c) return safeSendMessage(chatId, "Aucune Rare du moment actuellement.");
    safeSendMessage(chatId, `✨ Rare actuelle: #${c.id} — ${c.name}\nTitre: ${c.featured_title || "✨ Rare du moment"}`);
  } catch (e) { safeSendMessage(chatId, `❌ /rareinfo: ${e.message}`); }
});

bot.onText(/^\/partner\s+(\d+)(?:\s+([\s\S]+))?$/m, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");
  try {
    const id = Number(match[1]);
    const title = (match[2] || "").trim();
    const card = await dbGetCard(id);
    if (!card) return safeSendMessage(chatId, "❌ ID introuvable.");
    const updated = await dbSetPartner(id, title || "🤝 Partenaire du moment");
    safeSendMessage(chatId, `✅ Partenaire activé: #${updated.id} — ${updated.name}\nTitre: ${updated.partner_title || "🤝 Partenaire du moment"}`);
  } catch (e) { safeSendMessage(chatId, `❌ /partner: ${e.message}`); }
});
bot.onText(/^\/unpartner$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");
  try { await dbUnsetPartner(); safeSendMessage(chatId, "✅ Partenaire désactivé."); } catch (e) { safeSendMessage(chatId, `❌ /unpartner: ${e.message}`); }
});
bot.onText(/^\/partnerinfo$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");
  try {
    const c = await dbGetPartner();
    if (!c) return safeSendMessage(chatId, "ℹ️ Aucun partenaire actif.");
    safeSendMessage(chatId, `🤝 Partenaire actif: #${c.id} — ${c.name}\nTitre: ${c.partner_title || "🤝 Partenaire du moment"}`);
  } catch (e) { safeSendMessage(chatId, `❌ /partnerinfo: ${e.message}`); }
});

// =========================
// /dbtest
// =========================
bot.onText(/^\/dbtest$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!isAdminUser(userId)) return;

  try {
    assertSupabase();
    // try both tables
    const out = await runWithTable(TABLES.cards, async (t) => {
      const { error } = await sb.from(t).select("id").limit(1);
      if (error) throw error;
      return t;
    });
    safeSendMessage(chatId, `✅ Supabase OK (table ${out} accessible)`);
  } catch (e) {
    safeSendMessage(chatId, `❌ Supabase KO: ${e.message}`);
  }
});

// =========================
// callback_query handler (fix braces)
// =========================
bot.on("callback_query", async (query) => {
  const chatId = query?.message?.chat?.id;
  const userId = query?.from?.id;
  const data = query?.data || "";
  if (!chatId) return;

  try { await bot.answerCallbackQuery(query.id); } catch {}

  if (data === "menu_back") return sendStartMenu(chatId, userId);

  if (data === "menu_info") {
    const caption =
      "ℹ️ Informations\n\n" +
      "HarvestDex est un projet éducatif.\n" +
      "Aucune vente ici. Respecte les lois.\n\n" +
      "Weed: indica/sativa/hybrid.\n" +
      "Hash/Extraction/WPFF: microns + profils dans la fiche.";
    return safeSendPhoto(chatId, INFO_IMAGE_URL, {
      caption,
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "menu_back" }]] },
    });
  }

  if (data === "menu_support") {
    const caption = "🤝 Nous soutenir\n\nChoisis une option 👇";
    return safeSendPhoto(chatId, SUPPORT_IMAGE_URL, {
      caption,
      reply_markup: {
        inline_keyboard: [
          [{ text: "📲 Nous suivre", callback_data: "support_follow" }],
          [{ text: "💸 Don", callback_data: "support_donate" }],
          [{ text: "🤝 Nos partenaires", callback_data: "support_partners" }],
          [{ text: "⬅️ Retour", callback_data: "menu_back" }],
        ],
      },
    });
  }

  if (data === "support_partners") {
    return safeSendMessage(chatId, "🤝 Nos partenaires\n\nAucun partenaire pour le moment.");
  }
  if (data === "support_follow") return safeSendMessage(chatId, "📲 Nous suivre : (mets tes liens ici)");
  if (data === "support_donate") return safeSendMessage(chatId, "💸 Don : (mets ton lien TWINT/crypto/etc ici)");

  if (data === "menu_admin") {
    if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");
    return safeSendMessage(chatId, adminHelpText());
  }
  if (data === "menu_addform") {
    if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");
    return safeSendMessage(chatId, "➕ Pour ajouter : /addform");
  }
  if (data === "menu_rare") {
    if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");
    return safeSendMessage(chatId, "✨ Rare:\n/rare <id> (titre optionnel)\n/unrare\n/rareinfo");
  }
  if (data === "menu_partner") {
    if (!isAdminUser(userId)) return safeSendMessage(chatId, "⛔ Pas autorisé.");
    return safeSendMessage(chatId, "🤝 Partenaire:\n/partner <id> (titre optionnel)\n/unpartner\n/partnerinfo");
  }
});

// =========================
// Start server last
// =========================
app.listen(PORT, () => console.log("Serveur HarvestDex lancé sur le port", PORT));
