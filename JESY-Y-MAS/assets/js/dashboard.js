import { supabase, isSupabaseConfigured } from "./supabaseClient.js";

const status = document.querySelector("#dashboard-status");
const welcome = document.querySelector("#admin-welcome");
const logout = document.querySelector("#logout-button");
const quotesTable = document.querySelector("#quotes-table");
const refreshButton = document.querySelector("#refresh-quotes");

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

  await loadDashboard();
}

async function loadDashboard() {
  status.textContent = "Cargando solicitudes...";
  status.classList.remove("error");
  quotesTable.replaceChildren(makeMessageRow("Cargando solicitudes..."));

  const [quotes, projects, services, requests] = await Promise.all([
    supabase.from("quote_requests").select("id", { count: "exact", head: true }),
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase.from("services").select("id", { count: "exact", head: true }),
    supabase
      .from("quote_requests")
      .select("id, name, email, phone, service, location, description, attachments, status, created_at")
      .order("created_at", { ascending: false })
  ]);

  document.querySelector("#quote-count").textContent = quotes.count ?? "—";
  document.querySelector("#project-count").textContent = projects.count ?? "—";
  document.querySelector("#service-count").textContent = services.count ?? "—";
  if (quotes.error || projects.error || services.error || requests.error) {
    console.error("No se pudieron cargar completamente los datos administrativos:", {
      quotes: quotes.error,
      projects: projects.error,
      services: services.error,
      requests: requests.error
    });
  }
  if (requests.error) {
    status.textContent = "No se pudieron cargar las solicitudes. Verifica las columnas y las políticas RLS de quote_requests.";
    status.classList.add("error");
    quotesTable.replaceChildren(makeMessageRow("Error al cargar las solicitudes."));
    return;
  }

  renderRequests(requests.data);
  status.textContent = requests.data.length
    ? `${requests.data.length} solicitud${requests.data.length === 1 ? "" : "es"} recibida${requests.data.length === 1 ? "" : "s"}.`
    : "Todavía no hay solicitudes recibidas.";
  if (quotes.error || projects.error || services.error) {
    status.textContent += " Algunas estadísticas no están disponibles.";
  }
}

function makeMessageRow(message) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 6;
  cell.textContent = message;
  row.append(cell);
  return row;
}

function renderRequests(requests) {
  quotesTable.replaceChildren();
  if (!requests.length) {
    quotesTable.append(makeMessageRow("Todavía no hay solicitudes."));
    return;
  }

  requests.forEach((request) => {
    const row = document.createElement("tr");
    appendCell(row, new Date(request.created_at).toLocaleString("es-PA", {
      dateStyle: "medium",
      timeStyle: "short"
    }));

    const clientCell = document.createElement("td");
    const clientName = document.createElement("strong");
    clientName.textContent = request.name;
    const email = document.createElement("a");
    email.href = `mailto:${encodeURIComponent(request.email)}`;
    email.textContent = request.email;
    const phone = document.createElement("a");
    phone.href = `tel:${request.phone.replace(/[^\d+]/g, "")}`;
    phone.textContent = request.phone;
    clientCell.append(clientName, document.createElement("br"), email, document.createElement("br"), phone);
    row.append(clientCell);

    appendCell(row, request.service);

    const descriptionCell = document.createElement("td");
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Ver detalles";
    const description = document.createElement("p");
    description.textContent = request.description;
    details.append(summary, description);
    if (request.location) {
      const location = document.createElement("p");
      location.textContent = `Ubicación: ${request.location}`;
      details.append(location);
    }
    if (request.attachments?.length) {
      const attachmentInfo = document.createElement("p");
      attachmentInfo.textContent = `Archivos adjuntos: ${request.attachments.length}`;
      details.append(attachmentInfo);
    }
    descriptionCell.append(details);
    row.append(descriptionCell);

    const statusCell = document.createElement("td");
    const statusBadge = document.createElement("span");
    statusBadge.className = `request-status status-${request.status}`;
    statusBadge.textContent = formatStatus(request.status);
    statusCell.append(statusBadge);
    row.append(statusCell);

    const actions = document.createElement("td");
    actions.className = "request-actions";
    const canAccept = request.status !== "aceptado";
    const canReject = request.status !== "rechazado";
    actions.append(
      makeDecisionButton(request, "aceptado", "Aceptar", canAccept),
      makeDecisionButton(request, "rechazado", "Rechazar", canReject)
    );
    row.append(actions);
    quotesTable.append(row);
  });
}

function appendCell(row, text) {
  const cell = document.createElement("td");
  cell.textContent = text || "—";
  row.append(cell);
}

function formatStatus(value) {
  const labels = {
    nuevo: "Pendiente",
    en_revision: "En revisión",
    contactado: "Contactado",
    cotizado: "Cotizado",
    aceptado: "Aceptado",
    rechazado: "Rechazado",
    cerrado: "Cerrado"
  };
  return labels[value] || value;
}

function makeDecisionButton(request, decision, label, enabled) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `decision-button decision-${decision}`;
  button.textContent = label;
  button.disabled = !enabled;
  button.addEventListener("click", async () => {
    if (decision === "rechazado" && !window.confirm("¿Confirmas que quieres rechazar esta solicitud?")) return;
    button.disabled = true;
    status.textContent = "Actualizando solicitud...";
    status.classList.remove("error");

    const { error } = await supabase
      .from("quote_requests")
      .update({ status: decision })
      .eq("id", request.id);

    if (error) {
      console.error("No se pudo actualizar la solicitud:", error);
      status.textContent = "No se pudo guardar la decisión. Comprueba los estados permitidos y las políticas RLS.";
      status.classList.add("error");
      button.disabled = false;
      return;
    }

    request.status = decision;
    await loadDashboard();
  });
  return button;
}

logout?.addEventListener("click", async () => {
  if (supabase) await supabase.auth.signOut();
  window.location.href = "login.html";
});

refreshButton?.addEventListener("click", loadDashboard);

init();
