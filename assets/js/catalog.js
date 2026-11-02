import { supabase } from "./supabaseClient.js";

const serviceTargets = [
  { selector: "#public-services", limit: null },
  { selector: "#home-services", limit: 4 }
];

serviceTargets.forEach(({ selector, limit }) => {
  const container = document.querySelector(selector);
  if (container) loadServices(container, limit);
});

const projectsContainer = document.querySelector("#public-projects");
if (projectsContainer) loadProjects(projectsContainer);

async function loadServices(container, limit) {
  if (!supabase) {
    showCatalogMessage(container, "Los servicios estarán disponibles próximamente.");
    return;
  }

  let query = supabase
    .from("services")
    .select("id, name, description, image_url")
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) {
    console.error("No se pudieron cargar los servicios:", error);
    showCatalogMessage(container, getCatalogErrorMessage(error, "servicios"));
    return;
  }

  container.replaceChildren();
  if (!data.length) {
    showCatalogMessage(container, "Próximamente publicaremos nuestros servicios.");
    return;
  }

  data.forEach((service) => {
    const card = document.createElement("article");
    card.className = "service-card";
    if (service.image_url) {
      const image = document.createElement("img");
      image.className = "catalog-image";
      image.src = service.image_url;
      image.alt = service.name;
      image.loading = "lazy";
      card.append(image);
    }
    const heading = document.createElement("h3");
    heading.textContent = service.name;
    const description = document.createElement("p");
    description.textContent = service.description || "";
    card.append(heading, description);
    container.append(card);
  });
}

async function loadProjects(container) {
  if (!supabase) {
    showCatalogMessage(container, "Los proyectos estarán disponibles próximamente.");
    return;
  }
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, description, location, service_type, status, completed_on, image_urls")
    .eq("published", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("No se pudieron cargar los proyectos:", error);
    showCatalogMessage(container, getCatalogErrorMessage(error, "proyectos"));
    return;
  }

  container.replaceChildren();
  if (!data.length) {
    showCatalogMessage(container, "Próximamente publicaremos nuestros proyectos.");
    return;
  }

  data.forEach((project) => {
    const card = document.createElement("article");
    card.className = "project-card service-card";
    const imageUrls = project.image_urls || [];
    if (imageUrls.length) {
      const gallery = document.createElement("div");
      gallery.className = "project-photo-gallery";
      imageUrls.forEach((imageUrl, index) => {
        const image = document.createElement("img");
        image.className = "catalog-image";
        image.src = imageUrl;
        image.alt = `${project.name} · fotografía ${index + 1}`;
        image.loading = "lazy";
        gallery.append(image);
      });
      card.append(gallery);
    }
    const heading = document.createElement("h2");
    heading.textContent = project.name;
    const description = document.createElement("p");
    description.textContent = project.description || "";
    const specifications = document.createElement("dl");
    specifications.className = "project-specifications";
    const projectStatus = formatProjectStatus(project.status);
    [
      ["Tipo de trabajo", project.service_type],
      ["Ubicación", project.location],
      ["Estado", projectStatus],
      ["Fecha", project.completed_on ? new Date(`${project.completed_on}T00:00:00`).toLocaleDateString("es-PA", { year: "numeric", month: "long" }) : ""]
    ].filter(([, value]) => value).forEach(([label, value]) => {
      const item = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = label;
      const detail = document.createElement("dd");
      detail.textContent = value;
      item.append(term, detail);
      specifications.append(item);
    });
    card.append(heading, description);
    if (specifications.childElementCount) card.append(specifications);
    container.append(card);
  });
}

function formatProjectStatus(status) {
  const labels = {
    planificacion: "Planificación",
    en_proceso: "En proceso",
    pausado: "Pausado",
    completado: "Completado",
    cancelado: "Cancelado"
  };
  return labels[status] || status || "";
}

function showCatalogMessage(container, message) {
  const paragraph = document.createElement("p");
  paragraph.className = "catalog-message";
  paragraph.textContent = message;
  container.replaceChildren(paragraph);
}

function getCatalogErrorMessage(error, contentName) {
  if (error.code === "42501" && error.message?.includes("has_admin_permission")) {
    return `No se pudieron cargar los ${contentName}. Actualiza las políticas ejecutando supabase/role-permissions.sql en Supabase y vuelve a intentarlo.`;
  }
  return `No se pudieron cargar los ${contentName} en este momento.`;
}
