import { supabase, isSupabaseConfigured } from "./supabaseClient.js";

const form = document.querySelector("#login-form");
const status = document.querySelector("#login-status");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isSupabaseConfigured || !supabase) {
    status.textContent = "Configura primero las credenciales de Supabase.";
    return;
  }
  const data = new FormData(form);
  const { error } = await supabase.auth.signInWithPassword({
    email: String(data.get("email")).trim(),
    password: String(data.get("password"))
  });
  if (error) {
    status.textContent = "No se pudo iniciar sesión. Verifica tus datos o los usuarios habilitados.";
    return;
  }
  window.location.href = "dashboard.html";
});
