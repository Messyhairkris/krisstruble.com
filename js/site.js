// Behavior for every page: the index, drift-in, the loading cover, loops and the lightbox.
// chapters.js, reveal.js and embed-cover.js were written by the crew against hidden tests.
import { markCurrent } from "./chapters.js";
import { setupReveal } from "./reveal.js";
import { nextState, coverLabel } from "./embed-cover.js";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── The index: mark this page, and open/close it on small screens ──────────
markCurrent([...document.querySelectorAll(".index a")], location.pathname);
const index = document.getElementById("index");
const toggle = document.querySelector(".index-toggle");
toggle?.addEventListener("click", () => {
  const open = index.classList.toggle("open");
  toggle.setAttribute("aria-expanded", String(open));
  toggle.textContent = open ? "Close" : "Index";
});
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && index.classList.contains("open")) toggle.click();
});

// ── Drift-in (the CSS lists the same elements, so they start hidden) ───────
const REVEAL = [
  ".intro>*", ".tiles>li", ".about>*", ".chapter-head>.chapter-text", ".chapter-body>:not([data-cover])",
  ".chapter-body .split>*", ".chapter-body .grid>*", ".chapter-body .gallery>*", ".chapter-body .drawer>*",
  ".chapter-body .calls>*", ".chapter-body .loops>*", ".chapter-body .compare>*", ".pager>a",
].join(",");
const toReveal = [...document.querySelectorAll(REVEAL)];
for (const el of toReveal) el.classList.add("reveal");
setupReveal(toReveal, { Observer: window.IntersectionObserver, reduced });
window.siteReady = true;

// ── Loading cover for heavy embeds ─────────────────────────────────────────
// <div class="embed" data-embed-src data-embed-title data-embed-bytes [data-embed-load="visible"]>
const TIMEOUT_MS = 90000;
function setupEmbed(box) {
  const button = box.querySelector(".embed-cover");
  const label = box.querySelector(".embed-label");
  const opts = {
    title: box.dataset.embedTitle || "this",
    bytes: Number(box.dataset.embedBytes) || null,
    mbps: navigator.connection?.downlink || 25,
  };
  let state = "idle";
  let timer = 0;
  const show = () => {
    box.dataset.state = state;
    label.textContent = coverLabel(state, opts);
    button.setAttribute("aria-busy", String(state === "loading"));
    if (state === "ready") button.tabIndex = -1;
  };
  const go = (event) => {
    const was = state;
    state = nextState(state, event);
    if (state !== was) show();
    return state !== was;
  };
  const start = () => {
    if (!go(state === "failed" ? "retry" : "activate")) return;
    box.querySelector("iframe")?.remove();
    const frame = document.createElement("iframe");
    frame.title = box.dataset.embedFrameTitle || opts.title;
    frame.allow = "fullscreen";
    frame.addEventListener("load", () => { clearTimeout(timer); go("load"); }, { once: true });
    frame.addEventListener("error", () => { clearTimeout(timer); go("error"); }, { once: true });
    timer = setTimeout(() => go("timeout"), TIMEOUT_MS);
    frame.src = box.dataset.embedSrc;
    box.prepend(frame);
  };
  button.hidden = false;
  button.addEventListener("click", start);
  show();
  if (box.dataset.embedLoad === "visible" && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
    }, { rootMargin: "200px" });
    io.observe(box);
  }
}
document.querySelectorAll(".embed[data-embed-src]").forEach(setupEmbed);

// ── Short loops: people who ask for less motion get the poster and controls ─
if (reduced) {
  document.querySelectorAll("video.loop").forEach((v) => {
    v.pause();
    v.removeAttribute("autoplay");
    v.controls = true;
  });
}

// ── Lightbox for any picture wrapped in <button data-full> ─────────────────
let box = null;
let lastFocus = null;
function closeBox() {
  if (!box) return;
  box.remove();
  box = null;
  document.body.style.overflow = "";
  lastFocus?.focus();
}
function openBox(src, caption) {
  lastFocus = document.activeElement;
  box = document.createElement("div");
  box.className = "lightbox";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", caption || "Picture");
  const fig = document.createElement("figure");
  const img = document.createElement("img");
  img.src = src;
  img.alt = caption || "";
  const p = document.createElement("p");
  p.textContent = caption || "";
  const x = document.createElement("button");
  x.type = "button";
  x.textContent = "Close ✕";
  x.onclick = closeBox;
  fig.append(img, p);
  box.append(x, fig);
  box.addEventListener("click", (e) => { if (e.target === box) closeBox(); });
  document.body.append(box);
  document.body.style.overflow = "hidden";
  x.focus();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-full]");
  if (!b) return;
  openBox(b.dataset.full, b.closest("figure")?.querySelector("figcaption")?.textContent.trim());
});
addEventListener("keydown", (e) => { if (e.key === "Escape") closeBox(); });
