/**
 * SUPABASE CONFIG
 * ---------------
 * Fill these in from: Supabase Dashboard → Project Settings → API
 *   SUPABASE_URL      -> "Project URL"
 *   SUPABASE_ANON_KEY -> "anon public" key
 *
 * Do NOT put your service_role key here — this file ships to the browser.
 * The anon key is safe to expose; Row Level Security (see schema.sql) is
 * what actually protects the data.
 */

const SUPABASE_URL = "https://nhrzqyxofmfxtfllldyy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ocnpxeXhvZm1meHRmbGxsZHl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NDMwODksImV4cCI6MjEwMzExOTA4OX0.pZy6EbpCkkAHGQI_IwcEbm3fPr6xURzuhDjRUxUpYAE";

const IMGBB_API_KEY = "fda8242ebaef72454987329a59610ef0";

let supabaseClient = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  if (typeof supabase === "undefined") {
    // The Supabase JS library script (loaded via CDN, right before this file)
    // never reached the browser — usually a network/CDN block, or an
    // in-app browser/preview tool that restricts external script loading.
    // Everything that depends on supabaseClient will just no-op instead of
    // crashing; the console message below tells you exactly what to check.
    console.error(
      "[TSW] The Supabase library didn't load (window.supabase is undefined). " +
      "Login, accounts, and the admin dashboard won't work until this loads. " +
      "This usually means: (1) you're previewing this file in a restricted " +
      "in-app browser instead of a real hosted URL, or (2) something is " +
      "blocking the cdn.jsdelivr.net script. Try opening the site on its " +
      "real hosted address (GitHub Pages, Netlify, etc.) in a normal mobile browser."
    );
  } else {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,   // keeps the session in localStorage
        autoRefreshToken: true, // silently refreshes the token so it never expires mid-session
        detectSessionInUrl: true
      }
    });
  }
} else {
  console.warn(
    "[TSW] Supabase isn't configured yet. Add SUPABASE_URL and SUPABASE_ANON_KEY in js/supabase-config.js. " +
    "Login, accounts, and the admin dashboard won't work until then."
  );
}
