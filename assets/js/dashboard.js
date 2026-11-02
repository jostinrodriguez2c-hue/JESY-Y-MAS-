import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import "./background.js";

const status = document.querySelector("#dashboard-status");
const welcome = document.querySelector("#admin-welcome");
const logout = document.querySelector("#logout-button");
const quotesTable = document.querySelector("#quotes-table");
const refreshButton = document.querySelector("#refresh-quotes");
const requestFilterToggle = document.querySelector("#request-filter-toggle");
const requestFilterMenu = document.querySelector("#request-filter-menu");
const requestFilterControls = document.querySelector("#request-filter-controls");
const decisionDialog = document.querySelector("#decision-dialog");
const decisionForm = document.querySelector("#decision-form");
const decisionTitle = document.querySelector("#decision-title");
const decisionDescription = document.querySelector("#decision-description");
const decisionPasscode = document.querySelector("#decision-passcode");
const decisionError = document.querySelector("#decision-error");
const decisionConfirm = document.querySelector("#decision-confirm");
const decisionCancel = document.querySelector("#decision-cancel");
const hideRequestDialog = document.querySelector("#hide-request-dialog");
const hideRequestForm = document.querySelector("#hide-request-form");
const hideRequestDescription = document.querySelector("#hide-request-description");
const hideRequestError = document.querySelector("#hide-request-error");
const hideRequestConfirm = document.querySelector("#hide-request-confirm");
const hideRequestCancel = document.querySelector("#hide-request-cancel");
const hideRequestPasscode = document.querySelector("#hide-request-passcode");
const requestDetailsDialog = document.querySelector("#request-details-dialog");
const requestDetailsTitle = document.querySelector("#request-details-title");
const requestDetailsContent = document.querySelector("#request-details-content");
const requestDetailsClose = document.querySelector("#request-details-close");
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
const contentSelectionDialog = document.querySelector("#content-selection-dialog");
const contentSelectionForm = document.querySelector("#content-selection-form");
const contentSelectionTitle = document.querySelector("#content-selection-title");
const contentSelectionDescription = document.querySelector("#content-selection-description");
const contentSelection = document.querySelector("#content-selection");
const contentSelectionError = document.querySelector("#content-selection-error");
const contentSelectionConfirm = document.querySelector("#content-selection-confirm");
const deleteDialog = document.querySelector("#delete-dialog");
const deleteDescription = document.querySelector("#delete-description");
const deleteError = document.querySelector("#delete-error");
const deleteConfirm = document.querySelector("#delete-confirm");
const accessRequestsManagement = document.querySelector("#access-requests-management");
const toggleAccessRequests = document.querySelector("#toggle-access-requests");
const accessRequestsTable = document.querySelector("#access-requests-table");
const accessRequestsStatus = document.querySelector("#access-requests-status");
const refreshAccessRequests = document.querySelector("#refresh-access-requests");
const accessCodeDialog = document.querySelector("#access-code-dialog");
const accessCodeValue = document.querySelector("#access-code-value");
const accessCodeEmail = document.querySelector("#access-code-email");
const accessCodeDescription = document.querySelector("#access-code-description");
const copyAccessCode = document.querySelector("#copy-access-code");
const closeAccessCode = document.querySelector("#close-access-code");
const roleManagement = document.querySelector("#role-management");
const toggleRoleManagement = document.querySelector("#toggle-role-management");
const roleUsersTable = document.querySelector("#role-users-table");
const roleManagementStatus = document.querySelector("#role-management-status");
const refreshRoleUsers = document.querySelector("#refresh-role-users");
const rolePanels = document.querySelectorAll("[data-role-panel]");
const rolePanelButtons = document.querySelectorAll("[data-role-panel-button]");
const addRoleForm = document.querySelector("#add-role-form");
const addRoleName = document.querySelector("#add-role-name");
const addRolePermissions = document.querySelector("#add-role-permissions");
const editRoleForm = document.querySelector("#edit-role-form");
const editRoleSelect = document.querySelector("#edit-role-select");
const editRoleName = document.querySelector("#edit-role-name");
const editRolePermissions = document.querySelector("#edit-role-permissions");
const deleteRoleForm = document.querySelector("#delete-role-form");
const deleteRoleSelect = document.querySelector("#delete-role-select");
const deleteRoleAssigned = document.querySelector("#delete-role-assigned");
const closeAccessRequests = document.querySelector("#close-access-requests");
const closeRoleManagement = document.querySelector("#close-role-management");
const activityHistoryDialog = document.querySelector("#activity-history-dialog");
const toggleActivityHistory = document.querySelector("#toggle-activity-history");
const activityHistoryTable = document.querySelector("#activity-history-table");
const activityHistoryStatus = document.querySelector("#activity-history-status");
const refreshActivityHistory = document.querySelector("#refresh-activity-history");
const closeActivityHistory = document.querySelector("#close-activity-history");
const activityHistoryPageStatus = document.querySelector("#activity-history-page-status");
const previousActivityPage = document.querySelector("#previous-activity-page");
const nextActivityPage = document.querySelector("#next-activity-page");
let pendingDecision = null;
let editingContent = null;
let deletingContent = null;
let contentImagePreviewUrl = "";
let managedProjects = [];
let managedServices = [];
let pendingContentSelection = null;
let allRequests = [];
let activeRequestFilter = "all";
let pendingHiddenRequest = null;
let canManageRequests = false;
let currentAdminRole = null;
let currentUserId = null;
let canManageSuperadminRole = false;
let adminPermissions = {};
let adminRoles = [];
let adminRoleUsers = [];
let activityHistoryPage = 0;
const activityHistoryPageSize = 50;
const permissionGroups = [
  {
    label: "Cotizaciones",
    permissions: [
      { key: "quotes.view", label: "Ver cotizaciones y sus detalles" },
      { key: "quotes.update", label: "Cambiar su estado" },
      { key: "quotes.hide", label: "Ocultarlas de la lista sin borrarlas" }
    ]
  },
  {
    label: "Proyectos",
    permissions: [
      { key: "projects.view", label: "Ver proyectos en el panel" },
      { key: "projects.create", label: "Crear proyectos" },
      { key: "projects.update", label: "Editar proyectos" },
      { key: "projects.delete", label: "Eliminar proyectos" },
      { key: "projects.publish", label: "Publicar y ocultar proyectos" }
    ]
  },
  {
    label: "Servicios",
    permissions: [
      { key: "services.view", label: "Ver servicios en el panel" },
      { key: "services.create", label: "Crear servicios" },
      { key: "services.update", label: "Editar servicios" },
      { key: "services.delete", label: "Eliminar servicios" },
      { key: "services.publish", label: "Publicar y ocultar servicios" }
    ]
  },
  {
    label: "Solicitudes de acceso",
    permissions: [
      { key: "access_requests.view", label: "Ver solicitudes" },
      { key: "access_requests.reject", label: "Rechazar solicitudes" }
    ]
  },
  {
    label: "Historial",
    permissions: [
      { key: "activity_history.view", label: "Ver el historial de actividad" }
    ]
  }
];
const permissionRequirements = {
  "quotes.update": ["quotes.view"],
  "quotes.hide": ["quotes.view"],
  "projects.update": ["projects.view"],
  "projects.delete": ["projects.view"],
  "projects.publish": ["projects.view", "projects.update"],
  "services.update": ["services.view"],
  "services.delete": ["services.view"],
  "services.publish": ["services.view", "services.update"],
  "access_requests.reject": ["access_requests.view"]
};

function hasPermission(permission) {
  return adminPermissions[permission] === true;
}

const projectLocations = [
  "Panamá",
  "Panamá Oeste",
  "Colón",
  "Coclé",
  "Veraguas",
  "Chiriquí",
  "Bocas del Toro",
  "Herrera",
  "Los Santos",
  "Darién",
  "Comarca Guna Yala",
  "Comarca Emberá-Wounaan",
  "Comarca Ngäbe-Buglé",
  "Comarca Naso Tjër Di",
  "Comarca Kuna de Madungandí",
  "Comarca Kuna de Wargandí",
  "Otra ubicación"
];

const projectTypes = [
  "Construcción",
  "Diseño y planos",
  "Instalaciones eléctricas",
  "Remodelaciones",
  "Supervisión de obras",
  "Obras civiles",
  "Consultoría de ingeniería",
  "Otro"
];

const projectStatuses = [
  { value: "planificacion", label: "Planificación" },
  { value: "en_proceso", label: "En proceso" },
  { value: "pausado", label: "Pausado" },
  { value: "completado", label: "Completado" },
  { value: "cancelado", label: "Cancelado" }
];

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

  const { data: role, error: roleError } = await supabase.rpc("access_admin_role");

  if (roleError || !role) {
    await supabase.auth.signOut();
    window.location.href = "login.html";
    return;
  }

  const [permissionsResult, primarySuperadminResult] = await Promise.all([
    supabase.rpc("get_my_admin_permissions"),
    supabase.rpc("is_primary_superadmin")
  ]);
  if (permissionsResult.error || primarySuperadminResult.error) {
    console.error("No se pudieron cargar permisos del dashboard:", {
      permissions: permissionsResult.error,
      primarySuperadmin: primarySuperadminResult.error
    });
    welcome.textContent = "No se pudieron cargar los permisos. Aplica la migración supabase/role-permissions.sql.";
    return;
  }

  currentAdminRole = role;
  currentUserId = user.id;
  adminPermissions = permissionsResult.data || {};
  canManageSuperadminRole = primarySuperadminResult.data === true;
  populateRolePermissionFields(addRolePermissions);
  showRolePanel("add");
  welcome.textContent = `Sesión iniciada: ${user.email} · Rol: ${role}`;
  canManageRequests = hasPermission("quotes.view");
  requestFilterControls.hidden = !canManageRequests;
  toggleAccessRequests.hidden = !hasPermission("access_requests.view");
  toggleActivityHistory.hidden = !hasPermission("activity_history.view");
  toggleRoleManagement.hidden = !canManageSuperadminRole;
  document.querySelector(".requests-section").hidden = !canManageRequests;
  const canViewProjects = ["view", "create", "update", "delete"].some((action) => hasPermission(`projects.${action}`));
  const canViewServices = ["view", "create", "update", "delete"].some((action) => hasPermission(`services.${action}`));
  contentManagement.hidden = !canViewProjects && !canViewServices;
  document.querySelector("#manage-projects-heading").closest(".management-section").hidden = !canViewProjects;
  document.querySelector("#manage-services-heading").closest(".management-section").hidden = !canViewServices;
  document.querySelector("#add-project").hidden = !hasPermission("projects.create");
  document.querySelector("#edit-project").hidden = !hasPermission("projects.update");
  document.querySelector("#delete-project").hidden = !hasPermission("projects.delete");
  document.querySelector("#add-service").hidden = !hasPermission("services.create");
  document.querySelector("#edit-service").hidden = !hasPermission("services.update");
  document.querySelector("#delete-service").hidden = !hasPermission("services.delete");
  if (canViewProjects || canViewServices) {
    contentManagement.hidden = false;
    await loadContentManagement();
  }

  await loadDashboard();
}

async function loadAccessRequests() {
  accessRequestsStatus.textContent = "Cargando solicitudes de acceso...";
  accessRequestsStatus.classList.remove("error");
  const { data, error } = await supabase
    .from("admin_access_requests")
    .select("id, full_name, email, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("No se pudieron cargar las solicitudes de acceso:", error);
    accessRequestsStatus.textContent = "No se pudieron cargar las solicitudes. Revisa que esté aplicada la configuración SQL de acceso administrativo.";
    accessRequestsStatus.classList.add("error");
    accessRequestsTable.replaceChildren(makeTableMessage("Error al cargar las solicitudes de acceso.", 4));
    return;
  }

  accessRequestsTable.replaceChildren();
  if (!data.length) {
    accessRequestsTable.append(makeTableMessage("No hay solicitudes de acceso pendientes.", 4));
    accessRequestsStatus.textContent = "";
    return;
  }

  data.forEach((request) => {
    const row = document.createElement("tr");
    appendCell(row, request.full_name);
    appendCell(row, request.email);
    appendCell(row, new Date(request.created_at).toLocaleDateString("es-PA"));

    const actions = document.createElement("td");
    actions.className = "access-request-actions";
    actions.append(
      makeAccessRequestButton(request, "approve"),
      makeAccessRequestButton(request, "reject")
    );
    row.append(actions);
    accessRequestsTable.append(row);
  });
  accessRequestsStatus.textContent = "";
}

function populateRolePermissionFields(container, permissions = {}) {
  container.replaceChildren();
  permissionGroups.forEach((group) => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "role-permission-group";
    const legend = document.createElement("legend");
    legend.textContent = group.label;
    fieldset.append(legend);

    group.permissions.forEach((permission) => {
      const label = document.createElement("label");
      label.className = "role-permission-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "permission";
      checkbox.value = permission.key;
      checkbox.checked = permissions[permission.key] === true;
      const text = document.createElement("span");
      text.textContent = permission.label;
      label.append(checkbox, text);
      fieldset.append(label);
      checkbox.addEventListener("change", () => {
        const dependentKeys = Object.entries(permissionRequirements)
          .filter(([, requirements]) => requirements.includes(permission.key))
          .map(([key]) => key);
        if (checkbox.checked) {
          permissionRequirements[permission.key]?.forEach((requiredKey) => {
            const required = container.querySelector(`[name="permission"][value="${requiredKey}"]`);
            if (required) required.checked = true;
          });
        } else {
          dependentKeys.forEach((key) => {
            const dependent = container.querySelector(`[name="permission"][value="${key}"]`);
            if (dependent) dependent.checked = false;
          });
        }
      });
    });
    container.append(fieldset);
  });
}

function readRolePermissions(container) {
  return Object.fromEntries(
    permissionGroups.flatMap((group) =>
      group.permissions.map((permission) => [
        permission.key,
        Boolean(container.querySelector(`[name="permission"][value="${permission.key}"]`)?.checked)
      ])
    )
  );
}

function roleKeyFromName(name) {
  return name.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function updateRoleSelectors() {
  const selectedEditRole = editRoleSelect.value;
  const selectedDeleteRole = deleteRoleSelect.value;
  const fillSelect = (select, roles, placeholder) => {
    select.replaceChildren();
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = placeholder;
    select.append(emptyOption);
    roles.forEach((role) => {
      const option = document.createElement("option");
      option.value = role.role_key;
      option.textContent = role.is_system
        ? `${role.display_name} (del sistema)`
        : role.display_name;
      select.append(option);
    });
  };
  fillSelect(editRoleSelect, adminRoles, "Selecciona un rol");
  fillSelect(deleteRoleSelect, adminRoles.filter((role) => !role.is_system), "Selecciona un rol personalizado");
  if (adminRoles.some((role) => role.role_key === selectedEditRole)) {
    editRoleSelect.value = selectedEditRole;
  }
  if (adminRoles.some((role) => role.role_key === selectedDeleteRole && !role.is_system)) {
    deleteRoleSelect.value = selectedDeleteRole;
  }
  updateRoleEditor();
  updateDeleteRoleStatus();
}

function updateRoleEditor() {
  const role = adminRoles.find((entry) => entry.role_key === editRoleSelect.value);
  editRoleName.value = role?.display_name || "";
  populateRolePermissionFields(editRolePermissions, role?.permissions || {});
  const isLockedRole = !role || role.role_key === "superadmin";
  editRoleName.disabled = isLockedRole;
  editRolePermissions.querySelectorAll("input").forEach((input) => {
    input.disabled = isLockedRole;
  });
  editRoleForm.querySelector('button[type="submit"]').disabled = isLockedRole;
}

function updateDeleteRoleStatus() {
  const role = adminRoles.find((entry) => entry.role_key === deleteRoleSelect.value);
  deleteRoleAssigned.textContent = role
    ? `Cuentas asignadas: ${role.assigned_users}.`
    : "";
  deleteRoleForm.querySelector('button[type="submit"]').disabled =
    !role || Number(role.assigned_users) > 0;
}

function renderAdminRoleUsers() {
  roleUsersTable.replaceChildren();
  if (!adminRoleUsers.length) {
    roleUsersTable.append(makeTableMessage("No hay cuentas disponibles.", 4));
    return;
  }

  adminRoleUsers.forEach((user) => {
    const row = document.createElement("tr");
    appendCell(row, user.full_name || "—");
    appendCell(row, user.email || "—");

    const roleCell = document.createElement("td");
    const select = document.createElement("select");
    select.className = "role-select";
    select.setAttribute("aria-label", `Rol de ${user.full_name || user.email}`);
    adminRoles.forEach((role) => {
      const option = document.createElement("option");
      option.value = role.role_key;
      option.textContent = role.display_name;
      option.selected = role.role_key === user.role;
      select.append(option);
    });
    roleCell.append(select);
    row.append(roleCell);

    const actions = document.createElement("td");
    actions.className = "role-management-actions";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "btn btn-orange";
    save.textContent = "Guardar";
    const isCurrentUser = user.user_id === currentUserId;
    const isPrimaryOwner = user.is_primary_superadmin;
    select.disabled = isCurrentUser || isPrimaryOwner;
    save.disabled = select.disabled;
    if (isCurrentUser) save.title = "No puedes cambiar tu propio rol.";
    if (isPrimaryOwner) save.title = "El rol del superadmin principal está protegido.";
    save.addEventListener("click", () => updateUserRole(user, select, save));
    actions.append(save);
    row.append(actions);
    roleUsersTable.append(row);
  });
}

async function loadRoleManagement() {
  roleManagementStatus.textContent = "Cargando roles y cuentas...";
  roleManagementStatus.classList.remove("error");
  const [rolesResult, usersResult] = await Promise.all([
    supabase.rpc("list_admin_roles"),
    supabase.rpc("list_admin_role_users")
  ]);
  if (rolesResult.error || usersResult.error) {
    const error = rolesResult.error || usersResult.error;
    console.error("No se pudieron cargar los roles:", error);
    roleManagementStatus.textContent = `No se pudieron cargar los roles (${error.code || "error"}): ${error.message}`;
    roleManagementStatus.classList.add("error");
    return;
  }

  adminRoles = rolesResult.data || [];
  adminRoleUsers = usersResult.data || [];
  updateRoleSelectors();
  renderAdminRoleUsers();
  roleManagementStatus.textContent = "";
}

function showRolePanel(panelName) {
  rolePanels.forEach((panel) => {
    panel.hidden = panel.dataset.rolePanel !== panelName;
  });
  rolePanelButtons.forEach((button) => {
    const selected = button.dataset.rolePanelButton === panelName;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-current", selected ? "page" : "false");
  });
}

rolePanelButtons.forEach((button) => {
  button.addEventListener("click", () => showRolePanel(button.dataset.rolePanelButton));
});

editRoleSelect?.addEventListener("change", updateRoleEditor);
deleteRoleSelect?.addEventListener("change", updateDeleteRoleStatus);

addRoleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const displayName = addRoleName.value.trim();
  const roleKey = roleKeyFromName(displayName);
  if (roleKey.length < 2 || ["support", "editor", "admin", "superadmin"].includes(roleKey)) {
    roleManagementStatus.textContent = "Ese nombre no genera un identificador válido o está reservado para un rol del sistema.";
    roleManagementStatus.classList.add("error");
    return;
  }

  const submit = addRoleForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  roleManagementStatus.textContent = "Creando rol...";
  roleManagementStatus.classList.remove("error");
  const { error } = await supabase.rpc("add_admin_role", {
    p_role_key: roleKey,
    p_display_name: displayName,
    p_permissions: readRolePermissions(addRolePermissions)
  });
  submit.disabled = false;
  if (error) {
    console.error("No se pudo crear el rol:", error);
    roleManagementStatus.textContent = `No se pudo crear el rol: ${error.message}`;
    roleManagementStatus.classList.add("error");
    return;
  }

  addRoleForm.reset();
  populateRolePermissionFields(addRolePermissions);
  await loadRoleManagement();
  showRolePanel("assign");
  roleManagementStatus.textContent = `Se creó el rol “${displayName}”.`;
});

editRoleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const role = adminRoles.find((entry) => entry.role_key === editRoleSelect.value);
  if (!role || role.role_key === "superadmin") return;
  const submit = editRoleForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  roleManagementStatus.textContent = "Guardando permisos...";
  roleManagementStatus.classList.remove("error");
  const { error } = await supabase.rpc("update_admin_role", {
    p_role_key: role.role_key,
    p_display_name: editRoleName.value.trim(),
    p_permissions: readRolePermissions(editRolePermissions)
  });
  submit.disabled = false;
  if (error) {
    console.error("No se pudieron guardar los permisos del rol:", error);
    roleManagementStatus.textContent = `No se pudieron guardar los permisos: ${error.message}`;
    roleManagementStatus.classList.add("error");
    return;
  }

  await loadRoleManagement();
  roleManagementStatus.textContent = `Se actualizaron los permisos de “${editRoleName.value.trim()}”.`;
});

deleteRoleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const role = adminRoles.find((entry) => entry.role_key === deleteRoleSelect.value);
  if (!role || role.is_system || Number(role.assigned_users) > 0) return;
  if (!window.confirm(`¿Eliminar el rol “${role.display_name}”? Esta acción no se puede deshacer.`)) return;

  const submit = deleteRoleForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  roleManagementStatus.textContent = "Eliminando rol...";
  roleManagementStatus.classList.remove("error");
  const { error } = await supabase.rpc("delete_admin_role", {
    p_role_key: role.role_key
  });
  if (error) {
    console.error("No se pudo eliminar el rol:", error);
    roleManagementStatus.textContent = `No se pudo eliminar el rol: ${error.message}`;
    roleManagementStatus.classList.add("error");
    updateDeleteRoleStatus();
    return;
  }

  await loadRoleManagement();
  roleManagementStatus.textContent = `Se eliminó el rol “${role.display_name}”.`;
});

async function updateUserRole(user, select, button) {
  if (select.value === user.role) return;
  button.disabled = true;
  select.disabled = true;
  roleManagementStatus.textContent = "Guardando rol...";
  roleManagementStatus.classList.remove("error");

  const { error } = await supabase.rpc("set_admin_user_role", {
    p_user_id: user.user_id,
    p_role: select.value
  });

  if (error) {
    console.error("No se pudo actualizar el rol:", error);
    roleManagementStatus.textContent = `No se pudo actualizar el rol: ${error.message}`;
    roleManagementStatus.classList.add("error");
    button.disabled = false;
    select.disabled = false;
    return;
  }

  roleManagementStatus.textContent = `Rol actualizado para ${user.full_name || user.email}.`;
  await loadRoleManagement();
}

async function loadActivityHistory() {
  activityHistoryStatus.textContent = "Cargando historial...";
  activityHistoryStatus.classList.remove("error");
  const { data, error } = await supabase.rpc("list_admin_activity", {
    p_limit: activityHistoryPageSize,
    p_offset: activityHistoryPage * activityHistoryPageSize
  });

  if (error) {
    console.error("No se pudo cargar el historial de actividad:", error);
    activityHistoryStatus.textContent = `No se pudo cargar el historial (${error.code || "error"}): ${error.message}.`;
    activityHistoryStatus.classList.add("error");
    activityHistoryTable.replaceChildren(makeTableMessage("Error al cargar el historial.", 4));
    previousActivityPage.disabled = true;
    nextActivityPage.disabled = true;
    activityHistoryPageStatus.textContent = "";
    return;
  }

  activityHistoryTable.replaceChildren();
  if (!data.length) {
    activityHistoryTable.append(makeTableMessage("Todavía no hay actividad registrada.", 4));
    activityHistoryStatus.textContent = "";
    activityHistoryPage = 0;
    activityHistoryPageStatus.textContent = "0 eventos";
    previousActivityPage.disabled = true;
    nextActivityPage.disabled = true;
    return;
  }

  data.forEach((entry) => {
    const row = document.createElement("tr");
    appendCell(row, new Date(entry.created_at).toLocaleString("es-PA", {
      dateStyle: "medium",
      timeStyle: "short"
    }));
    appendCell(row, entry.actor_email || entry.actor_name || "Visitante");
    appendCell(row, formatActivityAction(entry.action));
    appendCell(row, formatActivityDetails(entry.details));
    activityHistoryTable.append(row);
  });
  const totalCount = Number(data[0].total_count);
  const firstEvent = activityHistoryPage * activityHistoryPageSize + 1;
  const lastEvent = Math.min(firstEvent + data.length - 1, totalCount);
  activityHistoryStatus.textContent = `${firstEvent}–${lastEvent} de ${totalCount} eventos.`;
  activityHistoryPageStatus.textContent = `${firstEvent}–${lastEvent} de ${totalCount}`;
  previousActivityPage.disabled = activityHistoryPage === 0;
  nextActivityPage.disabled = lastEvent >= totalCount;
}

function formatActivityAction(action) {
  const labels = {
    "auth.login": "Inicio de sesión",
    "auth.logout": "Cierre de sesión",
    "account.created": "Cuenta activada",
    "access_request.submitted": "Solicitud de acceso enviada",
    "access_request.approved": "Solicitud de acceso aprobada",
    "access_request.rejected": "Solicitud de acceso rechazada",
    "access_request.deleted": "Solicitud de acceso eliminada",
    "role.changed": "Rol actualizado",
    "role.created": "Rol creado",
    "role.updated": "Permisos de rol actualizados",
    "role.deleted": "Rol eliminado",
    "quote.submitted": "Cotización recibida",
    "quote.status_changed": "Estado de cotización cambiado",
    "quote.hidden": "Cotización ocultada",
    "quote.updated": "Cotización editada",
    "quote.deleted": "Cotización eliminada",
    "project.created": "Proyecto agregado",
    "project.updated": "Proyecto editado",
    "project.deleted": "Proyecto eliminado",
    "service.created": "Servicio agregado",
    "service.updated": "Servicio editado",
    "service.deleted": "Servicio eliminado"
  };
  return labels[action] || String(action || "Actividad").replaceAll(".", " ");
}

function formatActivityDetails(details) {
  if (!details || typeof details !== "object") return "—";
  return Object.entries(details)
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${value && typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" · ") || "—";
}

function makeAccessRequestButton(request, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = action === "approve" ? "btn btn-orange" : "btn btn-dark";
  button.textContent = action === "approve"
    ? currentAdminRole === "superadmin" ? "Aceptar y generar código" : "Aceptar (solo superadmin)"
    : "Rechazar";
  if (action === "approve" && currentAdminRole !== "superadmin") {
    button.disabled = true;
    button.title = "Solo el superadministrador puede aprobar y generar códigos.";
  } else if (action === "reject" && !hasPermission("access_requests.reject")) {
    button.disabled = true;
    button.title = "Tu rol no tiene permiso para rechazar solicitudes.";
  }
  button.addEventListener("click", () => {
    if (action === "approve") approveAccessRequest(request, button);
    else rejectAccessRequest(request, button);
  });
  return button;
}

async function approveAccessRequest(request, button) {
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, "0");
  button.disabled = true;
  accessRequestsStatus.textContent = "Aprobando solicitud...";
  accessRequestsStatus.classList.remove("error");

  const { error } = await supabase.rpc("issue_admin_activation_code", {
    p_request_id: request.id,
    p_code: code
  });

  if (error) {
    console.error("No se pudo aprobar la solicitud de acceso:", error);
    button.disabled = false;
    accessRequestsStatus.textContent = "No se pudo aprobar la solicitud. Comprueba tu rol de superadministrador y la configuración SQL.";
    accessRequestsStatus.classList.add("error");
    return;
  }

  accessCodeValue.value = code;
  accessCodeEmail.textContent = `Correo aprobado: ${request.email}`;
  accessCodeDescription.textContent = "Entrega este código de 4 dígitos personalmente al trabajador. Solo se muestra una vez y vence en 24 horas.";
  accessCodeDialog.showModal();
  await loadAccessRequests();
}

async function rejectAccessRequest(request, button) {
  if (!window.confirm(`¿Rechazar la solicitud de acceso de ${request.full_name}?`)) return;
  button.disabled = true;
  accessRequestsStatus.textContent = "Actualizando solicitud...";
  accessRequestsStatus.classList.remove("error");
  const { error } = await supabase.rpc("reject_admin_access_request", {
    p_request_id: request.id
  });

  if (error) {
    console.error("No se pudo rechazar la solicitud de acceso:", error);
    button.disabled = false;
    accessRequestsStatus.textContent = "No se pudo rechazar la solicitud. Comprueba tu rol de superadministrador y la configuración SQL.";
    accessRequestsStatus.classList.add("error");
    return;
  }

  await loadAccessRequests();
}

async function loadContentManagement() {
  managementStatus.textContent = "Cargando proyectos y servicios...";
  managementStatus.classList.remove("error");
  const [projects, services] = await Promise.all([
    hasPermission("projects.view")
      ? supabase.from("projects")
        .select("id, name, description, location, service_type, status, completed_on, image_urls, published")
        .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    hasPermission("services.view")
      ? supabase.from("services")
        .select("id, name, description, image_url, active")
        .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null })
  ]);

  if (projects.error || services.error) {
    console.error("No se pudieron cargar los datos editables:", {
      projects: projects.error,
      services: services.error
    });
    managementStatus.textContent = "No se pudieron cargar proyectos o servicios. Revisa las políticas RLS y columnas de Supabase.";
    managementStatus.classList.add("error");
    if (projects.error) projectsTable.replaceChildren(makeTableMessage("Error al cargar proyectos.", 4));
    if (services.error) servicesTable.replaceChildren(makeTableMessage("Error al cargar servicios.", 3));
    return;
  }

  renderManagedProjects(projects.data);
  renderManagedServices(services.data);
  managedProjects = projects.data;
  managedServices = services.data;
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
    projectsTable.append(makeTableMessage("Aún no hay proyectos. Usa “Agregar proyecto” para crear el primero.", 4));
    return;
  }

  projects.forEach((project) => {
    const row = document.createElement("tr");
    appendCell(row, project.name);
    appendCell(row, project.location);
    appendCell(row, formatProjectStatus(project.status));
    appendCell(row, project.published ? "Publicado" : "Borrador");
    projectsTable.append(row);
  });
}

function renderManagedServices(services) {
  servicesTable.replaceChildren();
  if (!services.length) {
    servicesTable.append(makeTableMessage("Aún no hay servicios. Usa “Agregar servicio” para crear el primero.", 3));
    return;
  }

  services.forEach((service) => {
    const row = document.createElement("tr");
    appendCell(row, service.name);
    appendCell(row, service.description);
    appendCell(row, service.active ? "Publicado" : "Oculto");
    servicesTable.append(row);
  });
}

function formatProjectStatus(value) {
  const status = projectStatuses.find((option) => option.value === value);
  return status?.label || value || "—";
}

function openContentSelection(type, action) {
  const items = type === "project" ? managedProjects : managedServices;
  const singular = type === "project" ? "proyecto" : "servicio";
  contentSelection.replaceChildren();
  contentSelectionError.textContent = "";
  pendingContentSelection = { type, action };
  contentSelectionTitle.textContent = `${action === "edit" ? "Editar" : "Eliminar"} ${singular}`;
  contentSelectionDescription.textContent = items.length
    ? `Selecciona cuál ${singular} deseas ${action === "edit" ? "editar" : "eliminar"}.`
    : `Todavía no hay ${type === "project" ? "proyectos" : "servicios"} para ${action === "edit" ? "editar" : "eliminar"}.`;
  contentSelectionConfirm.textContent = action === "edit" ? "Editar" : "Eliminar de la lista";
  contentSelectionConfirm.disabled = !items.length;
  contentSelectionDialog.classList.toggle("is-deleting", action === "delete");

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = items.length ? `Selecciona un ${singular}` : "No hay elementos disponibles";
  contentSelection.append(placeholder);
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    contentSelection.append(option);
  });
  contentSelectionDialog.showModal();
}

function addContentField({ name, label, value = "", type = "text", required = false, multiline = false, help = "", compact = false }) {
  const wrapper = document.createElement("label");
  wrapper.className = `content-field${compact ? " content-field-compact" : ""}`;
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

function addContentSelect({ name, label, options, value = "", required = false, compact = false }) {
  const wrapper = document.createElement("label");
  wrapper.className = `content-field${compact ? " content-field-compact" : ""}`;
  wrapper.textContent = label;
  const select = document.createElement("select");
  select.name = name;
  select.required = required;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecciona una opción";
  select.append(placeholder);
  options.forEach((option) => {
    const entry = typeof option === "string" ? { value: option, label: option } : option;
    const element = document.createElement("option");
    element.value = entry.value;
    element.textContent = entry.label;
    element.selected = entry.value === value;
    select.append(element);
  });
  wrapper.append(select);
  contentFields.append(wrapper);
  return select;
}

function addContentImageField({ name, label, value = "", help = "" }) {
  const wrapper = document.createElement("div");
  wrapper.className = "content-field content-field-compact content-image-field";

  const links = document.createElement("textarea");
  links.name = name;
  links.rows = 1;
  links.value = value;
  links.placeholder = "https://...";
  const linksLabel = document.createElement("label");
  linksLabel.className = "content-field content-field-compact";
  linksLabel.textContent = `${label} (enlace público)`;
  linksLabel.append(links);

  const fileLabel = document.createElement("label");
  fileLabel.className = "content-field content-field-compact";
  fileLabel.textContent = "O selecciona una fotografía desde esta computadora";
  const fileInput = document.createElement("input");
  fileInput.name = `${name}_file`;
  fileInput.type = "file";
  fileInput.accept = "image/jpeg,image/png,image/webp";
  const fileName = document.createElement("span");
  fileName.className = "content-file-name";
  fileName.textContent = "Ningún archivo seleccionado";
  const preview = document.createElement("img");
  preview.className = "content-image-preview";
  preview.alt = `Vista previa: ${label.toLocaleLowerCase("es")}`;
  preview.hidden = true;
  const helpText = document.createElement("small");
  helpText.textContent = help || "JPG, PNG o WEBP de hasta 5 MB. Los enlaces deben ser públicos; Google Drive debe permitir acceso a cualquiera con el enlace.";
  fileLabel.append(fileInput, fileName, preview, helpText);
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    fileName.textContent = file?.name || "Ningún archivo seleccionado";
    if (contentImagePreviewUrl) URL.revokeObjectURL(contentImagePreviewUrl);
    contentImagePreviewUrl = file ? URL.createObjectURL(file) : "";
    preview.src = contentImagePreviewUrl;
    preview.hidden = !file;
  });

  wrapper.append(linksLabel, fileLabel);
  contentFields.append(wrapper);
  return { links, fileInput };
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
  editingContent = {
    type,
    id: item?.id ?? null,
    currentPublished: item?.published ?? item?.active ?? false
  };
  contentFields.replaceChildren();
  contentError.textContent = "";
  contentDialogTitle.textContent = item
    ? `Editar ${type === "project" ? "proyecto" : "servicio"}`
    : `Agregar ${type === "project" ? "proyecto" : "servicio"}`;

  if (type === "project") {
    addContentField({ name: "name", label: "Nombre del proyecto *", value: item?.name, required: true });
    addContentField({ name: "description", label: "Descripción *", value: item?.description, multiline: true, required: true });
    const locationMatch = projectLocations
      .filter((location) => location !== "Otra ubicación")
      .find((location) => item?.location === location || item?.location?.startsWith(`${location} · `));
    const selectedLocation = locationMatch || (item?.location ? "Otra ubicación" : "");
    addContentSelect({
      name: "location_region",
      label: "Ubicación *",
      options: projectLocations,
      value: selectedLocation,
      required: true,
      compact: true
    });
    const locationDetail = addContentField({
      name: "location_detail",
      label: "Distrito, corregimiento o sector",
      value: locationMatch && item?.location !== locationMatch
        ? item.location.slice(locationMatch.length + 3)
        : locationMatch ? "" : item?.location || "",
      required: selectedLocation === "Otra ubicación",
      help: "Obligatorio si eliges “Otra ubicación”.",
      compact: true
    });
    const locationSelect = contentFields.querySelector('[name="location_region"]');
    locationSelect.addEventListener("change", () => {
      locationDetail.required = locationSelect.value === "Otra ubicación";
    });
    addContentSelect({
      name: "service_type",
      label: "Tipo de trabajo *",
      options: projectTypes,
      value: projectTypes.includes(item?.service_type) ? item.service_type : item?.service_type ? "Otro" : "",
      required: true,
      compact: true
    });
    const normalizedStatus = String(item?.status || "").trim().toLocaleLowerCase("es").replace(/[\s-]+/g, "_");
    const statusAliases = { en_ejecucion: "en_proceso", finalizado: "completado", terminado: "completado" };
    const statusValue = statusAliases[normalizedStatus] || normalizedStatus;
    addContentSelect({
      name: "status",
      label: "Estado del proyecto *",
      options: projectStatuses,
      value: projectStatuses.some((status) => status.value === statusValue) ? statusValue : "",
      required: true,
      compact: true
    });
    addContentField({ name: "completed_on", label: "Fecha de realización", value: item?.completed_on, type: "date" });
    addContentImageField({
      name: "image_urls",
      label: "Fotografías del proyecto",
      value: item?.image_urls?.join("\n")
    });
    if (hasPermission("projects.publish")) {
      addContentCheckbox({ name: "published", label: "Mostrar este proyecto en la página pública", checked: item?.published ?? false });
    }
  } else {
    addContentField({ name: "name", label: "Nombre del servicio *", value: item?.name, required: true });
    addContentField({ name: "description", label: "Descripción *", value: item?.description, multiline: true, required: true });
    addContentImageField({ name: "image_url", label: "Imagen del servicio", value: item?.image_url });
    if (hasPermission("services.publish")) {
      addContentCheckbox({ name: "active", label: "Mostrar este servicio en la página pública", checked: item?.active ?? true });
    }
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
      .map((url) => normalizeImageUrl(url.trim()))
      .filter(Boolean);
    if (imageUrls.some((url) => !/^https?:\/\//i.test(url))) {
      throw new Error("Cada imagen debe tener un enlace que empiece con http:// o https://.");
    }
    const region = String(formData.get("location_region") || "");
    const locationDetail = String(formData.get("location_detail") || "").trim();
    if (!region || (region === "Otra ubicación" && !locationDetail)) {
      throw new Error("Selecciona una ubicación y completa el detalle si elegiste “Otra ubicación”.");
    }
    const location = region === "Otra ubicación"
      ? locationDetail
      : locationDetail ? `${region} · ${locationDetail}` : region;
    const serviceType = String(formData.get("service_type") || "");
    const projectStatus = String(formData.get("status") || "");
    if (!projectTypes.includes(serviceType) || !projectStatuses.some((status) => status.value === projectStatus)) {
      throw new Error("Selecciona el tipo de trabajo y el estado del proyecto.");
    }
    const imageFile = formData.get("image_urls_file");
    if (imageFile?.size) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(imageFile.type) || imageFile.size > 5 * 1024 * 1024) {
        throw new Error("La fotografía debe ser JPG, PNG o WEBP y no superar 5 MB.");
      }
    }
    return {
      name: String(formData.get("name") || "").trim(),
      description: String(formData.get("description") || "").trim(),
      location,
      service_type: serviceType,
      status: projectStatus,
      completed_on: String(formData.get("completed_on") || "") || null,
      image_urls: imageUrls,
      image_file: imageFile?.size ? imageFile : null,
      published: hasPermission("projects.publish")
        ? formData.get("published") === "on"
        : editingContent.currentPublished
    };
  }

  const imageUrl = String(formData.get("image_url") || "").trim();
  const normalizedImageUrl = normalizeImageUrl(imageUrl);
  if (normalizedImageUrl && !/^https?:\/\//i.test(normalizedImageUrl)) {
    throw new Error("El enlace de imagen debe empezar con http:// o https://.");
  }
  const imageFile = formData.get("image_url_file");
  if (imageFile?.size && (!["image/jpeg", "image/png", "image/webp"].includes(imageFile.type) || imageFile.size > 5 * 1024 * 1024)) {
    throw new Error("La fotografía debe ser JPG, PNG o WEBP y no superar 5 MB.");
  }
  return {
    name: String(formData.get("name") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    image_url: normalizedImageUrl || null,
    image_file: imageFile?.size ? imageFile : null,
    active: hasPermission("services.publish")
      ? formData.get("active") === "on"
      : editingContent.currentPublished
  };
}

function normalizeImageUrl(value) {
  if (!value) return "";
  let url;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  if (url.hostname !== "drive.google.com") return value;
  const fileId = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || url.searchParams.get("id");
  return fileId ? `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}` : value;
}

async function uploadCatalogImage(file, type) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("No se pudo verificar la sesión administrativa para subir la imagen.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/${type === "project" ? "projects" : "services"}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from("catalog-images").upload(path, file, {
    contentType: file.type,
    upsert: false
  });
  if (error) throw error;
  return supabase.storage.from("catalog-images").getPublicUrl(path).data.publicUrl;
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
  try {
    if (payload.image_file) {
      const uploadedImageUrl = await uploadCatalogImage(payload.image_file, editingContent.type);
      if (editingContent.type === "project") payload.image_urls.push(uploadedImageUrl);
      else payload.image_url = uploadedImageUrl;
    }
    delete payload.image_file;
  } catch (error) {
    console.error("No se pudo subir la fotografía del catálogo:", error);
    contentError.textContent = error.message || "No se pudo subir la fotografía. Verifica la configuración de Storage.";
    contentSave.disabled = false;
    contentSave.textContent = editingContent.id ? "Guardar cambios" : "Agregar";
    return;
  }
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
document.querySelector("#edit-project")?.addEventListener("click", () => openContentSelection("project", "edit"));
document.querySelector("#delete-project")?.addEventListener("click", () => openContentSelection("project", "delete"));
document.querySelector("#edit-service")?.addEventListener("click", () => openContentSelection("service", "edit"));
document.querySelector("#delete-service")?.addEventListener("click", () => openContentSelection("service", "delete"));
document.querySelector("#content-cancel")?.addEventListener("click", () => contentDialog.close());
document.querySelector("#delete-cancel")?.addEventListener("click", () => deleteDialog.close());
document.querySelector("#content-selection-cancel")?.addEventListener("click", () => contentSelectionDialog.close());
contentSelectionForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!pendingContentSelection || !contentSelection.value) {
    contentSelectionError.textContent = "Selecciona un elemento de la lista.";
    return;
  }
  const items = pendingContentSelection.type === "project" ? managedProjects : managedServices;
  const selectedItem = items.find((item) => item.id === contentSelection.value);
  if (!selectedItem) {
    contentSelectionError.textContent = "No se encontró el elemento seleccionado. Actualiza la lista e inténtalo de nuevo.";
    return;
  }
  const { type, action } = pendingContentSelection;
  contentSelectionDialog.close();
  if (action === "edit") openContentDialog(type, selectedItem);
  else openDeleteDialog(type, selectedItem);
});
contentSelectionDialog?.addEventListener("close", () => {
  contentSelectionForm.reset();
  contentSelectionError.textContent = "";
  contentSelectionConfirm.disabled = false;
  pendingContentSelection = null;
});
contentDialog?.addEventListener("close", () => {
  if (contentImagePreviewUrl) URL.revokeObjectURL(contentImagePreviewUrl);
  contentImagePreviewUrl = "";
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

  if (!hasPermission("quotes.view")) return;
  const [quotes, projects, services, requests] = await Promise.all([
    supabase.from("quote_requests").select("id", { count: "exact", head: true }),
    hasPermission("projects.view")
      ? supabase.from("projects").select("id", { count: "exact", head: true })
      : Promise.resolve({ count: null, error: null }),
    hasPermission("services.view")
      ? supabase.from("services").select("id", { count: "exact", head: true })
      : Promise.resolve({ count: null, error: null }),
    supabase
      .from("quote_requests")
      .select("id, name, email, phone, service, location, description, attachments, status, created_at, hidden_from_admin")
      .eq("hidden_from_admin", false)
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

  allRequests = requests.data;
  updateRequestFilterCounts(allRequests);
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
  const filteredRequests = requests.filter((request) => {
    const category = getRequestCategory(request.status);
    return activeRequestFilter === "all" || category === activeRequestFilter;
  });
  if (!filteredRequests.length) {
    const messages = {
      all: "Todavía no hay solicitudes.",
      accepted: "No hay solicitudes aceptadas.",
      pending: "No hay solicitudes pendientes.",
      rejected: "No hay solicitudes rechazadas."
    };
    quotesTable.append(makeMessageRow(messages[activeRequestFilter]));
    return;
  }

  filteredRequests.forEach((request) => {
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
    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "request-details-trigger";
    detailsButton.textContent = "Ver detalles";
    detailsButton.addEventListener("click", () => openRequestDetails(request));
    descriptionCell.append(detailsButton);
    row.append(descriptionCell);

    const statusCell = document.createElement("td");
    const statusBadge = document.createElement("span");
    statusBadge.className = `request-status status-${request.status}`;
    statusBadge.textContent = formatStatus(request.status);
    statusCell.append(statusBadge);
    row.append(statusCell);

    const actionCell = document.createElement("td");
    actionCell.className = "request-actions-cell";
    const actions = document.createElement("div");
    actions.className = "request-actions";
    const canAccept = hasPermission("quotes.update") && request.status !== "aceptado";
    const canPend = hasPermission("quotes.update") && request.status !== "nuevo";
    const canReject = hasPermission("quotes.update") && request.status !== "rechazado";
    actions.append(
      makeDecisionButton(request, "aceptado", "Aceptar", canAccept),
      makeDecisionButton(request, "nuevo", "Pendiente", canPend),
      makeDecisionButton(request, "rechazado", "Rechazar", canReject)
    );
    if (hasPermission("quotes.hide")) {
      const hideButton = document.createElement("button");
      hideButton.type = "button";
      hideButton.className = "decision-button decision-hide";
      hideButton.textContent = "Eliminar";
      hideButton.setAttribute("aria-label", `Eliminar de la lista la solicitud de ${request.name}`);
      hideButton.addEventListener("click", () => openHideRequestDialog(request));
      actions.append(hideButton);
    }
    actionCell.append(actions);
    row.append(actionCell);
    quotesTable.append(row);
  });
}

function getRequestCategory(status) {
  const normalizedStatus = String(status || "").toLocaleLowerCase();
  if (["aceptado", "accepted", "approved"].includes(normalizedStatus)) return "accepted";
  if (["rechazado", "rejected"].includes(normalizedStatus)) return "rejected";
  return "pending";
}

function updateRequestFilterCounts(requests) {
  const counts = { accepted: 0, pending: 0, rejected: 0 };
  requests.forEach((request) => {
    counts[getRequestCategory(request.status)] += 1;
  });
  document.querySelector("#accepted-count").textContent = String(counts.accepted);
  document.querySelector("#pending-count").textContent = String(counts.pending);
  document.querySelector("#rejected-count").textContent = String(counts.rejected);
}

requestFilterToggle?.addEventListener("click", () => {
  const isExpanded = requestFilterToggle.getAttribute("aria-expanded") === "true";
  requestFilterToggle.setAttribute("aria-expanded", String(!isExpanded));
  requestFilterMenu.classList.toggle("is-open", !isExpanded);
});

requestFilterToggle?.parentElement.addEventListener("mouseenter", () => {
  requestFilterMenu.classList.add("is-open");
});

requestFilterToggle?.parentElement.addEventListener("mouseleave", () => {
  if (requestFilterToggle.getAttribute("aria-expanded") !== "true") {
    requestFilterMenu.classList.remove("is-open");
  }
});

requestFilterMenu?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-request-filter]");
  if (!button) return;
  activeRequestFilter = activeRequestFilter === button.dataset.requestFilter
    ? "all"
    : button.dataset.requestFilter;
  requestFilterMenu.querySelectorAll("[data-request-filter]").forEach((option) => {
    option.classList.toggle("is-selected", option.dataset.requestFilter === activeRequestFilter);
  });
  requestFilterToggle.textContent = activeRequestFilter === "all"
    ? "Filtrar solicitudes"
    : button.firstChild.textContent.trim();
  requestFilterToggle.setAttribute("aria-expanded", "false");
  requestFilterMenu.classList.remove("is-open");
  requestFilterToggle.focus();
  renderRequests(allRequests);
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".request-filter")) return;
  requestFilterToggle?.setAttribute("aria-expanded", "false");
  requestFilterMenu?.classList.remove("is-open");
});

function openHideRequestDialog(request) {
  pendingHiddenRequest = request;
  hideRequestDescription.textContent =
    `La solicitud de ${request.name} dejará de aparecer en esta lista, pero seguirá guardada en Supabase.`;
  hideRequestError.textContent = "";
  hideRequestPasscode.value = "";
  hideRequestConfirm.disabled = false;
  hideRequestCancel.disabled = false;
  hideRequestPasscode.disabled = false;
  hideRequestConfirm.textContent = "Eliminar de la lista";
  hideRequestDialog.showModal();
  hideRequestPasscode.focus();
}

hideRequestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!pendingHiddenRequest) return;

  if (hideRequestPasscode.value !== "2002") {
    hideRequestError.textContent = "La clave no es correcta. No se ocultó la solicitud.";
    hideRequestPasscode.value = "";
    hideRequestPasscode.focus();
    return;
  }

  hideRequestConfirm.disabled = true;
  hideRequestCancel.disabled = true;
  hideRequestPasscode.disabled = true;
  hideRequestConfirm.textContent = "Ocultando...";
  const { data, error } = await supabase
    .from("quote_requests")
    .update({ hidden_from_admin: true })
    .eq("id", pendingHiddenRequest.id)
    .select("id");

  if (error || !data?.length) {
    console.error("No se pudo ocultar la solicitud:", error || "No se actualizó ninguna fila.");
    hideRequestError.textContent = "No se pudo ocultar la solicitud. Comprueba el SQL y los permisos administrativos.";
    hideRequestConfirm.disabled = false;
    hideRequestCancel.disabled = false;
    hideRequestPasscode.disabled = false;
    hideRequestConfirm.textContent = "Eliminar de la lista";
    return;
  }

  allRequests = allRequests.filter((request) => request.id !== pendingHiddenRequest.id);
  updateRequestFilterCounts(allRequests);
  renderRequests(allRequests);
  hideRequestDialog.close();
  status.textContent = "Solicitud ocultada de la lista. Sigue guardada en Supabase.";
});

hideRequestCancel?.addEventListener("click", () => hideRequestDialog.close());
hideRequestDialog?.addEventListener("close", () => {
  pendingHiddenRequest = null;
  hideRequestError.textContent = "";
  hideRequestPasscode.value = "";
  hideRequestConfirm.disabled = false;
  hideRequestCancel.disabled = false;
  hideRequestPasscode.disabled = false;
  hideRequestConfirm.textContent = "Eliminar de la lista";
});

function openRequestDetails(request) {
  requestDetailsTitle.textContent = `Solicitud de ${request.name || request.full_name || "cliente"}`;
  requestDetailsContent.replaceChildren();

  const fields = [
    ["Cliente", request.name || request.full_name],
    ["Correo electrónico", request.email],
    ["Teléfono", request.phone],
    ["Servicio solicitado", request.service],
    ["Ubicación", request.location],
    ["Fecha de solicitud", new Date(request.created_at).toLocaleString("es-PA", {
      dateStyle: "long",
      timeStyle: "short"
    })],
    ["Estado", formatStatus(request.status)],
    ["Descripción del trabajo", request.description || request.details]
  ];

  fields.forEach(([label, value]) => {
    if (value === null || value === undefined || value === "") return;
    const item = document.createElement("div");
    item.className = "request-details-item";
    if (label === "Descripción del trabajo") {
      item.classList.add("request-details-description");
    }
    const term = document.createElement("h3");
    term.textContent = label;
    const content = document.createElement("p");
    content.textContent = String(value);
    item.append(term, content);
    requestDetailsContent.append(item);
  });

  const attachments = Array.isArray(request.attachments) ? request.attachments : [];
  if (attachments.length) {
    const item = document.createElement("div");
    item.className = "request-details-item request-details-attachments";
    const term = document.createElement("h3");
    term.textContent = "Archivos adjuntos";
    item.append(term);
    const list = document.createElement("ul");
    attachments.forEach((attachment, index) => {
      const attachmentUrl = typeof attachment === "string"
        ? attachment
        : attachment?.url || attachment?.publicUrl || attachment?.path;
      const attachmentName = typeof attachment === "object" && attachment
        ? attachment.name || attachment.fileName || `Archivo ${index + 1}`
        : `Archivo ${index + 1}`;
      const listItem = document.createElement("li");
      if (typeof attachmentUrl === "string" && /^https?:\/\//i.test(attachmentUrl)) {
        const link = document.createElement("a");
        link.href = attachmentUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = attachmentName;
        listItem.append(link);
      } else {
        listItem.textContent = attachmentName;
      }
      list.append(listItem);
    });
    item.append(list);
    requestDetailsContent.append(item);
  }

  requestDetailsDialog.showModal();
}

requestDetailsClose?.addEventListener("click", () => requestDetailsDialog.close());

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
  if (supabase) {
    const { error: activityError } = await supabase.rpc("record_admin_activity", {
      p_action: "auth.logout"
    });
    if (activityError) {
      console.error("No se pudo registrar el cierre de sesión:", activityError);
      status.textContent = "No se pudo guardar el cierre de sesión en el historial.";
      status.classList.add("error");
    }
    await supabase.auth.signOut();
  }
  window.location.href = "login.html";
});

refreshButton?.addEventListener("click", loadDashboard);
toggleAccessRequests?.addEventListener("click", async () => {
  accessRequestsManagement.showModal();
  toggleAccessRequests.setAttribute("aria-expanded", "true");
  await loadAccessRequests();
});
refreshAccessRequests?.addEventListener("click", loadAccessRequests);
toggleRoleManagement?.addEventListener("click", async () => {
  roleManagement.showModal();
  toggleRoleManagement.setAttribute("aria-expanded", "true");
  await loadRoleManagement();
});
refreshRoleUsers?.addEventListener("click", loadRoleManagement);
toggleActivityHistory?.addEventListener("click", async () => {
  activityHistoryPage = 0;
  activityHistoryDialog.showModal();
  toggleActivityHistory.setAttribute("aria-expanded", "true");
  await loadActivityHistory();
});
refreshActivityHistory?.addEventListener("click", loadActivityHistory);
previousActivityPage?.addEventListener("click", async () => {
  if (activityHistoryPage === 0) return;
  activityHistoryPage -= 1;
  await loadActivityHistory();
});
nextActivityPage?.addEventListener("click", async () => {
  nextActivityPage.disabled = true;
  activityHistoryPage += 1;
  await loadActivityHistory();
});
closeAccessRequests?.addEventListener("click", () => accessRequestsManagement.close());
closeRoleManagement?.addEventListener("click", () => roleManagement.close());
closeActivityHistory?.addEventListener("click", () => activityHistoryDialog.close());
accessRequestsManagement?.addEventListener("close", () => toggleAccessRequests.setAttribute("aria-expanded", "false"));
roleManagement?.addEventListener("close", () => toggleRoleManagement.setAttribute("aria-expanded", "false"));
activityHistoryDialog?.addEventListener("close", () => toggleActivityHistory.setAttribute("aria-expanded", "false"));
closeAccessCode?.addEventListener("click", () => accessCodeDialog.close());
accessCodeDialog?.addEventListener("close", () => {
  accessCodeValue.value = "";
  accessCodeEmail.textContent = "";
  accessCodeDescription.textContent = "Entrega este código de 4 dígitos personalmente al trabajador. Solo se muestra una vez y vence en 24 horas.";
});
copyAccessCode?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(accessCodeValue.value);
    accessCodeDescription.textContent = "Código copiado. Entrégalo personalmente al trabajador; vence en 24 horas y solo se usa una vez.";
  } catch (error) {
    console.error("No se pudo copiar el código de activación:", error);
    accessCodeDescription.textContent = "No se pudo copiar automáticamente. Selecciona el código y cópialo manualmente antes de cerrar.";
    accessCodeValue.focus();
    accessCodeValue.select();
  }
});

init();
