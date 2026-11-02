// Configura estos valores con los datos de tu proyecto Supabase.
// La clave anon/publishable puede estar en el navegador SIEMPRE que RLS esté bien configurado.
// NUNCA coloques aquí la clave service_role.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://xolmulhkvcthxbwsgjto.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_W0LEQMIjN0ylgrY9Uky8nQ_ttqg5e32";

const configured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("TU-PROYECTO") &&
  SUPABASE_ANON_KEY.startsWith("sb_publishable_") &&
  SUPABASE_ANON_KEY.length > 30;

export const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export const isSupabaseConfigured = configured;
