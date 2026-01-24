const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

console.log("ENV CHECK:", {
  BOT_TOKEN: BOT_TOKEN ? `OK(len=${BOT_TOKEN.length})` : "MISSING",
  WEBAPP_URL: WEBAPP_URL ? `OK(${WEBAPP_URL})` : "MISSING",
  SUPABASE_URL: SUPABASE_URL ? `OK(${SUPABASE_URL})` : "MISSING",
  SUPABASE_SERVICE_ROLE: SUPABASE_SERVICE_ROLE ? `OK(len=${SUPABASE_SERVICE_ROLE.length})` : "MISSING",
});

if (!BOT_TOKEN || !WEBAPP_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("❌ Variables d'environnement manquantes. Obligatoires : BOT_TOKEN, WEBAPP_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE");
  process.exit(1);
}
