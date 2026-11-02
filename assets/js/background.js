const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = new URL("../css/panama-background.css", import.meta.url).href;
document.head.append(stylesheet);
document.body.classList.add("panama-background");
