const SUPABASE_URL = 'https://fniaqhxejomoaiksxktg.supabase.co';

/*
 * This is the public "anon" key, not a secret — it is meant to be shipped in
 * client-side code. Row Level Security policies on the database (see
 * supabase/schema.sql) are what actually control who can read or write what.
 */
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuaWFxaHhlam9tb2Fpa3N4a3RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4OTA1NTgsImV4cCI6MjEwNTQ2NjU1OH0.uLVqcvpjaRUUyuuXC3GWS3tyJIDMvknOap8be5EFKTY';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
