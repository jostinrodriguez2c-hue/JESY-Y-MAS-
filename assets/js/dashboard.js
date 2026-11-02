import { supabase, isSupabaseConfigured } from "./supabaseClient.js";

const status = document.querySelector("#dashboard-status");
const welcome = document.querySelector("#admin-welcome");
const logout = document.querySelector("#logout-button");

async function init() {
  if (!isSupabaseConfigured || !supabase) {
    welcome.textContent = "Falta configurar Supabase.";
    return;
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    window.location.href = "login.html";
    return;
  }

  const { data: role, error: roleError } = await supabase.rpc("current_admin_role");

  if (roleError || !["superadmin", "admin", "soporte"].includes(role)) {
    await supabase.auth.signOut();
    window.location.href = "login.html";
    return;
  }

  welcome.textContent = `Sesión iniciada: ${user.email} · Rol: ${role}`;

  const [quotes, projects, services] = await Promise.all([
    supabase.from("quote_requests").select("id", { count: "exact", head: true }),
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase.from("services").select("id", { count: "exact", head: true })
  ]);

  document.querySelector("#quote-count").textContent = quotes.count ?? "—";
  document.querySelector("#project-count").textContent = projects.count ?? "—";
  document.querySelector("#service-count").textContent = services.count ?? "—";
  if (quotes.error || projects.error || services.error) {
    status.textContent = "Algunas estadísticas no están disponibles. Revisa las tablas y políticas RLS.";
  }
}

logout?.addEventListener("click", async () => {
  if (supabase) await supabase.auth.signOut();
  window.location.href = "login.html";
});

init();
