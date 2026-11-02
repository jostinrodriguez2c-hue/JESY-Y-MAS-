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
    showCatalogMessage(container, "No se pudieron cargar los servicios en este momento.");
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
    showCatalogMessage(container, "No se pudieron cargar los proyectos en este momento.");
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
    const imageUrl = project.image_urls?.[0];
    if (imageUrl) {
      const image = document.createElement("img");
      image.className = "catalog-image";
      image.src = imageUrl;
      image.alt = project.name;
      image.loading = "lazy";
      card.append(image);
    }
    const heading = document.createElement("h2");
    heading.textContent = project.name;
    const description = document.createElement("p");
    description.textContent = project.description || "";
    const metadata = document.createElement("p");
    metadata.className = "catalog-meta";
    metadata.textContent = [project.service_type, project.location, project.status, project.completed_on]
      .filter(Boolean)
      .join(" · ");
    card.append(heading, description, metadata);
    container.append(card);
  });
}

function showCatalogMessage(container, message) {
  const paragraph = document.createElement("p");
  paragraph.className = "catalog-message";
  paragraph.textContent = message;
  container.replaceChildren(paragraph);
}
