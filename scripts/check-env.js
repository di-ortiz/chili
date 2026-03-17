require("dotenv").config();
const keys = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "CLICKUP_API_TOKEN",
  "ANTHROPIC_API_KEY",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "AGENCYANALYTICS_API_KEY",
  "GOOGLE_SERVICE_ACCOUNT_JSON",
];
for (const k of keys) {
  const val = process.env[k];
  console.log(`${k}: ${val ? "OK (" + val.length + " chars)" : "MISSING"}`);
}
