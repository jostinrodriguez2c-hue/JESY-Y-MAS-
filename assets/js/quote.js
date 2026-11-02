import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import "./background.js";

const form = document.querySelector("#quote-form");
const status = document.querySelector("#quote-status");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "";

  if (!isSupabaseConfigured || !supabase) {
    status.textContent = "El sistema todavía no está conectado a Supabase. Configura assets/js/supabaseClient.js.";
    return;
  }

  const data = new FormData(form);
  const company = String(data.get("company") || "").trim();
  const budget = String(data.get("budget") || "").trim();
  const details = String(data.get("details") || "").trim();
  const request = {
    name: String(data.get("name") || "").trim(),
    email: String(data.get("email") || "").trim(),
    phone: String(data.get("phone") || "").trim(),
    location: String(data.get("location") || "").trim(),
    service: String(data.get("service") || "").trim(),
    description: [
      company && `Empresa: ${company}`,
      budget && `Presupuesto estimado: ${budget}`,
      details
    ].filter(Boolean).join("\n\n")
  };

  const { error } = await supabase.from("quote_requests").insert(request);
  if (error) {
    console.error(error);
    status.textContent = "No pudimos registrar tu solicitud. Intenta nuevamente o contáctanos por WhatsApp.";
    return;
  }

  status.textContent = "¡Solicitud recibida! Nuestro equipo se pondrá en contacto contigo.";
  form.reset();
});
