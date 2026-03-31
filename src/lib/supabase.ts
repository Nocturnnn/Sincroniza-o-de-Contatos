import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://symnhpygvslockvvbghh.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bW5ocHlndnNsb2NrdnZiZ2hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTI0MzUsImV4cCI6MjA5MDQ2ODQzNX0.N_aqt3CoNcB5v-PnUiZ36WgwRQpfb84gj06UlikQ7QA";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
