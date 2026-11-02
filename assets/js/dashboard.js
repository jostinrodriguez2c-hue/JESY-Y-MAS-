import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import "./background.js";

const status = document.querySelector("#dashboard-status");
const welcome = document.querySelector("#admin-welcome");
const logout = document.querySelector("#logout-button");
const quotesTable = document.querySelector("#quotes-table");
const refreshButton = document.querySelector("#refresh-quotes");
const decisionDialog = document.querySelector("#decision-dialog");
const decisionForm = document.querySelector("#decision-form");
const decisionTitle = document.querySelector("#decision-title");
const decisionDescription = document.querySelector("#decision-description");
const decisionPasscode = document.querySelector("#decision-passcode");
const decisionError = document.querySelector("#decision-error");
const decisionConfirm = document.querySelector("#decision-confirm");
const decisionCancel = document.querySelector("#decision-cancel");
const contentManagement = document.querySelector("#content-management");
const managementStatus = document.querySelector("#management-status");
const projectsTable = document.querySelector("#projects-table");
const servicesTable = document.querySelector("#services-table");
const contentDialog = document.querySelector("#content-dialog");
const contentForm = document.querySelector("#content-form");
const contentDialogTitle = document.querySelector("#content-dialog-title");
const contentFields = document.querySelector("#content-fields");
const contentError = document.querySelector("#content-error");
const contentSave = document.querySelector("#content-save");
const deleteDialog = document.querySelector("#delete-dialog");
const deleteDescription = document.querySelector("#delete-description");
const deleteError = document.querySelector("#delete-error");
const deleteConfirm = document.querySelector("#delete-confirm");
let pendingDecision = null;
let editingContent = null;
let deletingContent = null;

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
  if (role === "admin" || role === "superadmin") {
    contentManagement.hidden = false;
    await loadContentManagement();
  }

  await loadDashboard();
}

async function loadContentManagement() {
  managementStatus.textContent = "Cargando proyectos y servicios...";
  managementStatus.classList.remove("error");
  const [projects, services] = await Promise.all([
    supabase.from("projects")
      .select("id, name, description, location, service_type, status, completed_on, image_urls, published")
      .order("created_at", { ascending: false }),
    supabase.from("services")
      .select("id, name, description, image_url, active")
      .order("created_at", { ascending: true })
  ]);

  if (projects.error || services.error) {
    console.error("No se pudieron cargar los datos editables:", {
      projects: projects.error,
      services: services.error
    });
    managementStatus.textContent = "No se pudieron cargar proyectos o servicios. Revisa las políticas RLS y columnas de Supabase.";
    managementStatus.classList.add("error");
    if (projects.error) projectsTable.replaceChildren(makeTableMessage("Error al cargar proyectos.", 5));
    if (services.error) servicesTable.replaceChildren(makeTableMessage("Error al cargar servicios.", 4));
    return;
  }

  renderManagedProjects(projects.data);
  renderManagedServices(services.data);
  managementStatus.textContent = "";
}

function makeTableMessage(message, columnCount) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = columnCount;
  cell.textContent = message;
  row.append(cell);
  return row;
}

function renderManagedProjects(projects) {
  projectsTable.replaceChildren();
  if (!projects.length) {
    projectsTable.append(makeTableMessage("Aún no hay proyectos. Usa “Agregar proyecto” para crear el primero.", 5));
    return;
  }

  projects.forEach((project) => {
    const row = document.createElement("tr");
    appendCell(row, project.name);
    appendCell(row, project.location);
    appendCell(row, project.status);
    appendCell(row, project.published ? "Publicado" : "Borrador");
    const actions = document.createElement("td");
    actions.className = "management-actions";
    actions.append(
      makeContentAction("Editar", () => openContentDialog("project", project)),
      makeContentAction("Eliminar", () => openDeleteDialog("project", project))
    );
    row.append(actions);
    projectsTable.append(row);
  });
}

function renderManagedServices(services) {
  servicesTable.replaceChildren();
  if (!services.length) {
    servicesTable.append(makeTableMessage("Aún no hay servicios. Usa “Agregar servicio” para crear el primero.", 4));
    return;
  }

  services.forEach((service) => {
    const row = document.createElement("tr");
    appendCell(row, service.name);
    appendCell(row, service.description);
    appendCell(row, service.active ? "Publicado" : "Oculto");
    const actions = document.createElement("td");
    actions.className = "management-actions";
    actions.append(
      makeContentAction("Editar", () => openContentDialog("service", service)),
      makeContentAction("Eliminar", () => openDeleteDialog("service", service))
    );
    row.append(actions);
    servicesTable.append(row);
  });
}

function makeContentAction(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `management-action ${label === "Eliminar" ? "management-delete" : ""}`;
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

function addContentField({ name, label, value = "", type = "text", required = false, multiline = false, help = "" }) {
  const wrapper = document.createElement("label");
  wrapper.className = "content-field";
  wrapper.textContent = label;
  const input = multiline ? document.createElement("textarea") : document.createElement("input");
  input.name = name;
  input.value = value ?? "";
  if (multiline) {
    input.rows = name === "description" ? 4 : 3;
  } else {
    input.type = type;
  }
  input.required = required;
  if (type === "url") input.placeholder = "https://...";
  wrapper.append(input);
  if (help) {
    const note = document.createElement("small");
    note.textContent = help;
    wrapper.append(note);
  }
  contentFields.append(wrapper);
  return input;
}

function addContentCheckbox({ name, label, checked }) {
  const wrapper = document.createElement("label");
  wrapper.className = "content-checkbox";
  const input = document.createElement("input");
  input.name = name;
  input.type = "checkbox";
  input.checked = Boolean(checked);
  const text = document.createElement("span");
  text.textContent = label;
  wrapper.append(input, text);
  contentFields.append(wrapper);
}

function openContentDialog(type, item = null) {
  editingContent = { type, id: item?.id ?? null };
  contentFields.replaceChildren();
  contentError.textContent = "";
  contentDialogTitle.textContent = item
    ? `Editar ${type === "project" ? "proyecto" : "servicio"}`
    : `Agregar ${type === "project" ? "proyecto" : "servicio"}`;

  if (type === "project") {
    addContentField({ name: "name", label: "Nombre del proyecto *", value: item?.name, required: true });
    addContentField({ name: "description", label: "Descripción *", value: item?.description, multiline: true, required: true });
    addContentField({ name: "location", label: "Ubicación", value: item?.location });
    addContentField({ name: "service_type", label: "Tipo de trabajo", value: item?.service_type });
    addContentField({ name: "status", label: "Estado del proyecto", value: item?.status || "completado" });
    addContentField({ name: "completed_on", label: "Fecha de realización", value: item?.completed_on, type: "date" });
    addContentField({
      name: "image_urls",
      label: "Enlaces de fotografías",
      value: item?.image_urls?.join("\n"),
      multiline: true,
      help: "Pega una URL http(s) por línea. Para mostrar imágenes, usa enlaces públicos."
    });
    addContentCheckbox({ name: "published", label: "Mostrar este proyecto en la página pública", checked: item?.published ?? false });
  } else {
    addContentField({ name: "name", label: "Nombre del servicio *", value: item?.name, required: true });
    addContentField({ name: "description", label: "Descripción *", value: item?.description, multiline: true, required: true });
    addContentField({ name: "image_url", label: "Enlace de imagen", value: item?.image_url, type: "url" });
    addContentCheckbox({ name: "active", label: "Mostrar este servicio en la página pública", checked: item?.active ?? true });
  }

  contentSave.textContent = item ? "Guardar cambios" : "Agregar";
  contentSave.disabled = false;
  contentDialog.showModal();
  contentFields.querySelector("input, textarea")?.focus();
}

function readContentForm() {
  const formData = new FormData(contentForm);
  if (editingContent.type === "project") {
    const imageUrls = String(formData.get("image_urls") || "")
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean);
    if (imageUrls.some((url) => !/^https?:\/\//i.test(url))) {
      throw new Error("Cada imagen debe tener un enlace que empiece con http:// o https://.");
    }
    return {
      name: String(formData.get("name") || "").trim(),
      description: String(formData.get("description") || "").trim(),
      location: String(formData.get("location") || "").trim(),
      service_type: String(formData.get("service_type") || "").trim(),
      status: String(formData.get("status") || "completado").trim(),
      completed_on: String(formData.get("completed_on") || "") || null,
      image_urls: imageUrls,
      published: formData.get("published") === "on"
    };
  }

  const imageUrl = String(formData.get("image_url") || "").trim();
  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
    throw new Error("El enlace de imagen debe empezar con http:// o https://.");
  }
  return {
    name: String(formData.get("name") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    image_url: imageUrl || null,
    active: formData.get("active") === "on"
  };
}

contentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!editingContent) return;
  contentError.textContent = "";
  let payload;
  try {
    payload = readContentForm();
    if (!payload.name || !payload.description) {
      throw new Error("Completa el nombre y la descripción.");
    }
  } catch (error) {
    contentError.textContent = error.message;
    return;
  }

  contentSave.disabled = true;
  contentSave.textContent = "Guardando...";
  const table = editingContent.type === "project" ? "projects" : "services";
  const query = editingContent.id
    ? supabase.from(table).update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingContent.id)
    : supabase.from(table).insert(payload);
  const { error } = await query;
  if (error) {
    console.error(`No se pudo guardar ${editingContent.type}:`, error);
    contentError.textContent = "No se pudo guardar. Revisa los permisos RLS y vuelve a intentarlo.";
    contentSave.disabled = false;
    contentSave.textContent = editingContent.id ? "Guardar cambios" : "Agregar";
    return;
  }

  contentDialog.close();
  editingContent = null;
  await Promise.all([loadContentManagement(), loadDashboard()]);
  managementStatus.textContent = "Cambios guardados.";
});

function openDeleteDialog(type, item) {
  deletingContent = { type, item };
  deleteError.textContent = "";
  deleteDescription.textContent = `Se eliminará definitivamente "${item.name}". Esta acción no se puede deshacer.`;
  deleteDialog.showModal();
}

document.querySelector("#delete-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!deletingContent) return;
  deleteConfirm.disabled = true;
  deleteConfirm.textContent = "Eliminando...";
  deleteError.textContent = "";
  const table = deletingContent.type === "project" ? "projects" : "services";
  const { error } = await supabase.from(table).delete().eq("id", deletingContent.item.id);
  if (error) {
    console.error(`No se pudo eliminar ${deletingContent.type}:`, error);
    deleteError.textContent = "No se pudo eliminar. Comprueba los permisos y vuelve a intentarlo.";
    deleteConfirm.disabled = false;
    deleteConfirm.textContent = "Sí, eliminar";
    return;
  }
  deleteDialog.close();
  deletingContent = null;
  deleteConfirm.disabled = false;
  deleteConfirm.textContent = "Sí, eliminar";
  await Promise.all([loadContentManagement(), loadDashboard()]);
  managementStatus.textContent = "Elemento eliminado.";
});

document.querySelector("#add-project")?.addEventListener("click", () => openContentDialog("project"));
document.querySelector("#add-service")?.addEventListener("click", () => openContentDialog("service"));
document.querySelector("#content-cancel")?.addEventListener("click", () => contentDialog.close());
document.querySelector("#delete-cancel")?.addEventListener("click", () => deleteDialog.close());
contentDialog?.addEventListener("close", () => {
  contentForm.reset();
  contentFields.replaceChildren();
  contentError.textContent = "";
  contentSave.disabled = false;
  editingContent = null;
});
deleteDialog?.addEventListener("close", () => {
  deleteError.textContent = "";
  deleteConfirm.disabled = false;
  deleteConfirm.textContent = "Sí, eliminar";
  deletingContent = null;
});

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
    const canPend = request.status !== "nuevo";
    const canReject = request.status !== "rechazado";
    actions.append(
      makeDecisionButton(request, "aceptado", "Aceptar", canAccept),
      makeDecisionButton(request, "nuevo", "Pendiente", canPend),
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
    openDecisionDialog(request, decision, button);
  });
  return button;
}

function openDecisionDialog(request, decision, button) {
  pendingDecision = { request, decision, button };
  const isRejecting = decision === "rechazado";
  const isPending = decision === "nuevo";
  decisionDialog.classList.toggle("is-rejecting", isRejecting);
  decisionDialog.classList.toggle("is-pending", isPending);
  const actionLabel = isRejecting ? "rechazar" : isPending ? "dejar pendiente" : "aceptar";
  decisionTitle.textContent = isRejecting
    ? "Rechazar solicitud"
    : isPending ? "Dejar solicitud pendiente" : "Aceptar solicitud";
  decisionDescription.textContent =
    `Vas a ${actionLabel} la solicitud de ${request.name}. Ingresa la clave para confirmar.`;
  decisionConfirm.textContent = isRejecting
    ? "Sí, rechazar"
    : isPending ? "Sí, dejar pendiente" : "Sí, aceptar";
  decisionError.textContent = "";
  decisionPasscode.value = "";
  decisionDialog.showModal();
  decisionPasscode.focus();
}

decisionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!pendingDecision) return;

  if (decisionPasscode.value !== "2002") {
    decisionError.textContent = "La clave no es correcta. No se realizó ningún cambio.";
    decisionPasscode.value = "";
    decisionPasscode.focus();
    return;
  }

  const { request, decision, button } = pendingDecision;
  decisionConfirm.disabled = true;
  decisionCancel.disabled = true;
  decisionPasscode.disabled = true;
  decisionConfirm.textContent = "Guardando...";

  const { error } = await supabase
    .from("quote_requests")
    .update({ status: decision })
    .eq("id", request.id);

  if (error) {
    console.error("No se pudo actualizar la solicitud:", error);
    decisionError.textContent = "No se pudo guardar la decisión. Revisa los permisos y estados de Supabase.";
    decisionConfirm.disabled = false;
    decisionCancel.disabled = false;
    decisionPasscode.disabled = false;
    decisionConfirm.textContent = decision === "rechazado"
      ? "Sí, rechazar"
      : decision === "nuevo" ? "Sí, dejar pendiente" : "Sí, aceptar";
    return;
  }

  request.status = decision;
  button.disabled = true;
  decisionDialog.close();
  pendingDecision = null;
  decisionConfirm.disabled = false;
  decisionCancel.disabled = false;
  decisionPasscode.disabled = false;
  decisionConfirm.textContent = "Confirmar";
  await loadDashboard();
});

decisionCancel?.addEventListener("click", () => decisionDialog.close());
decisionDialog?.addEventListener("close", () => {
  pendingDecision = null;
  decisionForm.reset();
  decisionError.textContent = "";
  decisionConfirm.disabled = false;
  decisionCancel.disabled = false;
  decisionPasscode.disabled = false;
  decisionConfirm.textContent = "Confirmar";
});

logout?.addEventListener("click", async () => {
  if (supabase) await supabase.auth.signOut();
  window.location.href = "login.html";
});

refreshButton?.addEventListener("click", loadDashboard);

init();
