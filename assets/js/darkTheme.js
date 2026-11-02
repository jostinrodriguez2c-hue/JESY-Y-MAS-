export function loadDarkTheme() {
  let stylesheet = document.getElementById("dark-theme-stylesheet");
  if (!stylesheet) {
    stylesheet = document.createElement("link");
    stylesheet.id = "dark-theme-stylesheet";
    stylesheet.rel = "stylesheet";
    stylesheet.href = new URL("../css/dark-theme.css", import.meta.url).href;
  }
  document.head.append(stylesheet);
}
