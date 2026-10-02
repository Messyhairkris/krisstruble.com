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

// ── A cover that changes: <figure class="carousel" data-interval="10000"> ──
// Each .slide is a picture; one shows at a time. It waits while the pointer or keyboard is on
// it, while the page is hidden, and for people who ask for less motion it does not move at all.
function setupCarousel(fig) {
  const slides = [...fig.querySelectorAll(".slide")];
  const dots = [...fig.querySelectorAll(".dot")];
  const caption = fig.querySelector("figcaption");
  const controls = fig.querySelector(".carousel-controls");
  const pause = fig.querySelector(".carousel-pause");
  const every = Number(fig.dataset.interval) || 10000;
  let at = 0;
  let stopped = reduced;
  let held = false;
  const show = (i) => {
    at = (i + slides.length) % slides.length;
    slides.forEach((s, n) => {
      const on = n === at;
      s.classList.toggle("is-on", on);
      s.tabIndex = on ? 0 : -1;
      s.setAttribute("aria-hidden", String(!on));
      const img = s.querySelector("img");
      if (on || n === (at + 1) % slides.length) img.loading = "eager";
    });
    dots.forEach((d, n) => n === at ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current"));
    caption.innerHTML = slides[at].dataset.cap;
  };
  const label = () => {
    pause.textContent = stopped ? "Play" : "Pause";
    pause.setAttribute("aria-pressed", String(stopped));
  };
  dots.forEach((d, n) => d.addEventListener("click", () => show(n)));
  pause.addEventListener("click", () => { stopped = !stopped; label(); });
  fig.addEventListener("pointerenter", () => { held = true; });
  fig.addEventListener("pointerleave", () => { held = false; });
  fig.addEventListener("focusin", () => { held = true; });
  fig.addEventListener("focusout", () => { held = false; });
  setInterval(() => {
    if (stopped || held || document.hidden || box) return;
    show(at + 1);
  }, every);
  controls.hidden = false;
  label();
  show(0);
}
document.querySelectorAll(".carousel").forEach(setupCarousel);

// ── Lightbox for any picture wrapped in <button data-full> ─────────────────
// Opens the picture large, and from there every enlargeable picture on the page can be
// stepped through (arrow keys or the side buttons). Click anywhere off the picture to close.
let box = null;
let lastFocus = null;
const captionOf = (b) => (b.dataset.cap
  ? b.dataset.cap.replace(/<[^>]+>/g, "")
  : b.closest("figure")?.querySelector("figcaption")?.textContent || "").replace(/\s+/g, " ").trim();
// Every picture once, in page order. A rotating cover repeats pictures from further down the
// page, so its own copies only count when the picture appears nowhere else.
function galleryFor(clicked) {
  const all = [...document.querySelectorAll("button[data-full]")];
  const inBody = all.filter((b) => !b.closest(".carousel"));
  const known = new Set(inBody.map((b) => b.dataset.full));
  const coverOnly = all.filter((b) => b.closest(".carousel") && !known.has(b.dataset.full));
  const list = [...coverOnly, ...inBody].filter((b, i, a) => a.findIndex((o) => o.dataset.full === b.dataset.full) === i);
  return { list, at: Math.max(0, list.findIndex((b) => b.dataset.full === clicked.dataset.full)) };
}
function closeBox() {
  if (!box) return;
  box.remove();
  box = null;
  document.body.style.overflow = "";
  lastFocus?.focus({ preventScroll: true });
}
function openBox(clicked) {
  const { list, at: first } = galleryFor(clicked);
  let at = first;
  lastFocus = clicked;
  box = document.createElement("div");
  box.className = "lightbox";
  box.tabIndex = -1;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  const fig = document.createElement("figure");
  const img = document.createElement("img");
  const p = document.createElement("p");
  const count = document.createElement("span");
  count.className = "lb-count";
  const button = (cls, text, label, fn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = text;
    b.setAttribute("aria-label", label);
    b.onclick = fn;
    return b;
  };
  const show = (i) => {
    at = (i + list.length) % list.length;
    const caption = captionOf(list[at]);
    img.classList.remove("is-in");
    img.src = list[at].dataset.full;
    img.alt = caption;
    void img.offsetWidth;
    img.classList.add("is-in");
    p.textContent = caption;
    count.textContent = list.length > 1 ? `${at + 1} / ${list.length}` : "";
    box.setAttribute("aria-label", caption || "Picture");
    if (list.length > 1) new Image().src = list[(at + 1) % list.length].dataset.full;
  };
  const x = button("lb-close", "Close ✕", "Close", closeBox);
  const prev = button("lb-prev", "←", "Previous picture", () => show(at - 1));
  const next = button("lb-next", "→", "Next picture", () => show(at + 1));
  fig.append(img, p, count);
  box.append(x, fig);
  if (list.length > 1) box.append(prev, next);
  box.addEventListener("click", (e) => { if (!e.target.closest("img,button")) closeBox(); });
  box.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); show(at + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); show(at - 1); }
    else if (e.key === "Tab") {
      // keep the keyboard inside the lightbox
      const stops = [...box.querySelectorAll("button")];
      const i = stops.indexOf(document.activeElement);
      e.preventDefault();
      stops[(i + (e.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
    }
  });
  document.body.append(box);
  document.body.style.overflow = "hidden";
  show(at);
  box.focus();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-full]");
  if (b) openBox(b);
});
addEventListener("keydown", (e) => { if (e.key === "Escape") closeBox(); });
