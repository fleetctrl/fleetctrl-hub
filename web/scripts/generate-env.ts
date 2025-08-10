import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const envVars = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, "../public");
const envFile = path.join(publicDir, "env.js");

// Vytvoř složku public, pokud neexistuje
fs.mkdirSync(publicDir, { recursive: true });

const content = `window.__ENV__ = ${JSON.stringify(envVars, null, 2)};`;

fs.writeFileSync(envFile, content);

console.log(`✅ public/env.js generated at ${envFile}`);
