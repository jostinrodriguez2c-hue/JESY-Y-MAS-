import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import "./background.js";

const form = document.querySelector("#login-form");
const status = document.querySelector("#login-status");
const accessRequestForm = document.querySelector("#access-request-form");
const accessRequestStatus = document.querySelector("#access-request-status");
const activationForm = document.querySelector("#activation-form");
const activationStatus = document.querySelector("#activation-status");
const loginPanels = document.querySelector(".login-panels");
const activationCard = document.querySelector(".activation-card");
const passwordRecoveryForm = document.querySelector("#password-recovery-form");
const passwordRecoveryStatus = document.querySelector("#password-recovery-status");

function showPasswordRecovery() {
  loginPanels.hidden = true;
  activationCard.hidden = true;
  passwordRecoveryForm.hidden = false;
}

if (supabase) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") showPasswordRecovery();
  });
}

if (new URLSearchParams(window.location.search).get("recovery") === "1") {
  showPasswordRecovery();
}

function setFormBusy(target, busy, label) {
  const button = target.querySelector('button[type="submit"]');
  if (!button) return;
  button.disabled = busy;
  if (label) button.textContent = label;
}

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
  const { error: activityError } = await supabase.rpc("record_admin_activity", {
    p_action: "auth.login"
  });
  if (activityError) {
    console.error("No se pudo registrar el inicio de sesión:", activityError);
    status.textContent = "Iniciaste sesión, pero no se pudo guardar el evento en el historial.";
    window.setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 1200);
    return;
  }
  window.location.href = "dashboard.html";
});

passwordRecoveryForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isSupabaseConfigured || !supabase) {
    passwordRecoveryStatus.textContent = "Configura primero las credenciales de Supabase.";
    passwordRecoveryStatus.classList.add("error");
    return;
  }

  const data = new FormData(passwordRecoveryForm);
  const password = String(data.get("password"));
  if (password !== String(data.get("password_confirmation"))) {
    passwordRecoveryStatus.textContent = "Las contraseñas no coinciden.";
    passwordRecoveryStatus.classList.add("error");
    return;
  }

  setFormBusy(passwordRecoveryForm, true, "Guardando...");
  passwordRecoveryStatus.textContent = "";
  passwordRecoveryStatus.classList.remove("error");
  const { error } = await supabase.auth.updateUser({ password });
  setFormBusy(passwordRecoveryForm, false, "Guardar contraseña");
  if (error) {
    console.error("No se pudo actualizar la contraseña:", error);
    passwordRecoveryStatus.textContent = `No se pudo actualizar la contraseña (${error.code || "error"}): ${error.message}`;
    passwordRecoveryStatus.classList.add("error");
    return;
  }

  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
    console.error("La contraseña se actualizó, pero no se pudo cerrar la sesión:", signOutError);
    passwordRecoveryStatus.textContent = "La contraseña se actualizó, pero no se pudo cerrar la sesión. Cierra esta ventana y vuelve a iniciar sesión.";
    passwordRecoveryStatus.classList.add("error");
    return;
  }
  passwordRecoveryForm.reset();
  passwordRecoveryForm.hidden = true;
  loginPanels.hidden = false;
  activationCard.hidden = false;
  status.textContent = "Contraseña actualizada. Ya puedes iniciar sesión.";
});

accessRequestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isSupabaseConfigured || !supabase) {
    accessRequestStatus.textContent = "Configura primero las credenciales de Supabase.";
    return;
  }

  const data = new FormData(accessRequestForm);
  setFormBusy(accessRequestForm, true, "Enviando...");
  accessRequestStatus.textContent = "";
  accessRequestStatus.classList.remove("error");
  const { error } = await supabase.from("admin_access_requests").insert({
    full_name: String(data.get("full_name")).trim(),
    email: String(data.get("email")).trim().toLowerCase()
  });
  setFormBusy(accessRequestForm, false, "Enviar solicitud");

  if (error) {
    console.error("No se pudo enviar la solicitud de acceso:", error);
    accessRequestStatus.textContent = error.code === "23505"
      ? "Ya existe una solicitud pendiente con este correo."
      : "No se pudo enviar la solicitud. Verifica que esté aplicada la configuración SQL de acceso e inténtalo de nuevo.";
    accessRequestStatus.classList.add("error");
    return;
  }

  accessRequestForm.reset();
  accessRequestStatus.classList.remove("error");
  accessRequestStatus.textContent = "Solicitud enviada. Un superadministrador revisará tus datos y te contactará si es aprobada.";
});

activationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isSupabaseConfigured || !supabase) {
    activationStatus.textContent = "Configura primero las credenciales de Supabase.";
    return;
  }

  const data = new FormData(activationForm);
  const email = String(data.get("email")).trim().toLowerCase();
  const code = String(data.get("activation_code")).trim();
  const password = String(data.get("password"));
  setFormBusy(activationForm, true, "Activando...");
  activationStatus.textContent = "";
  activationStatus.classList.remove("error");

  const ticketBytes = crypto.getRandomValues(new Uint8Array(32));
  const ticket = Array.from(ticketBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const { data: prepared, error: prepareError } = await supabase.rpc("prepare_admin_account_activation", {
    p_email: email,
    p_code: code,
    p_ticket: ticket
  });

  if (prepareError || !prepared) {
    if (prepareError) console.error("No se pudo validar el código de activación:", prepareError);
    setFormBusy(activationForm, false, "Activar acceso");
    activationStatus.textContent = prepareError
      ? "No se pudo validar el código. Verifica que esté aplicada la configuración SQL de acceso e inténtalo de nuevo."
      : "El correo o código no es válido, venció, ya se usó o se alcanzó el límite de intentos.";
    activationStatus.classList.add("error");
    return;
  }

  const { data: result, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { activation_ticket: ticket } }
  });
  setFormBusy(activationForm, false, "Activar acceso");

  if (error) {
    console.error("No se pudo activar la cuenta:", error);
    const invalidCode = error.message.toLowerCase().includes("invalid_activation_code")
      || error.message.toLowerCase().includes("activation code");
    const approvalRequired = error.message.toLowerCase().includes("access_request_required")
      || error.message.toLowerCase().includes("access request required");
    const passwordError = error.message.toLowerCase().includes("password");
    if (approvalRequired) {
      activationStatus.textContent = "Necesitas una solicitud aprobada y el código temporal que entrega el superadministrador.";
    } else if (invalidCode) {
      activationStatus.textContent = "El correo o código no es válido, ya se usó o venció.";
    } else if (error.message.toLowerCase().includes("already registered")) {
      activationStatus.textContent = "Este correo ya tiene una cuenta. Inicia sesión o contacta al superadministrador.";
    } else if (passwordError) {
      activationStatus.textContent = "La contraseña no cumple la política configurada en Supabase.";
    } else {
      activationStatus.textContent = "No se pudo activar la cuenta. Verifica correo, código, configuración SQL y que los registros por correo estén habilitados.";
    }
    activationStatus.classList.add("error");
    return;
  }

  activationForm.reset();
  activationStatus.classList.remove("error");
  if (result.session) {
    window.location.href = "dashboard.html";
    return;
  }
  activationStatus.textContent = "Acceso activado. Revisa tu correo para confirmar la cuenta y luego inicia sesión.";
});
