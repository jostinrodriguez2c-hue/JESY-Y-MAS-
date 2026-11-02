// Configura estos valores con los datos de tu proyecto Supabase.
// La clave anon/publishable puede estar en el navegador SIEMPRE que RLS esté bien configurado.
// NUNCA coloques aquí la clave service_role.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
const SUPABASE_ANON_KEY = "TU_CLAVE_ANON_O_PUBLISHABLE";

const configured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("TU-PROYECTO") &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_ANON_KEY.includes("TU_CLAVE");

export const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export const isSupabaseConfigured = configured;
