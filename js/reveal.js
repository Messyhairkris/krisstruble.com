// Written by Qwen (crew), accepted against hidden tests 2026-09-28. Contract: crew/contracts/site_reveal.md
export const DEFAULTS = {
  threshold: 0.15,
  rootMargin: "0px 0px -8% 0px",
  stagger: 80,
  maxDelay: 400
};

export function delayFor(index, stagger = DEFAULTS.stagger, maxDelay = DEFAULTS.maxDelay) {
  const delay = Math.min(index * stagger, maxDelay);
  if (delay < 0 || !Number.isFinite(delay)) {
    return 0;
  }
  return delay;
}

export function setupReveal(elements, { Observer = null, reduced = false, options = {} } = {}) {
  const settings = { ...DEFAULTS, ...options };

  // Rule 1: only the boolean true counts as reduced motion.
  if (reduced === true || typeof Observer !== "function") {
    for (const el of elements) {
      el.classList.add("is-in");
    }
    return { observer: null, count: 0 };
  }

  const toObserve = [];
  for (const el of elements) {
    if (el.dataset.reveal === "none") {
      el.classList.add("is-in");
    } else {
      toObserve.push(el);
    }
  }

  const callback = (entries, obs) => {
    let i = 0;
    for (const entry of entries) {
      if (entry.isIntersecting !== true) {
        continue;
      }
      const target = entry.target;
      const delay = delayFor(i, settings.stagger, settings.maxDelay) + "ms";
      target.style.setProperty("--reveal-delay", delay);
      target.classList.add("is-in");
      obs.unobserve(target);
      i += 1;
    }
  };

  const observer = new Observer(callback, {
    threshold: settings.threshold,
    rootMargin: settings.rootMargin
  });

  for (const el of toObserve) {
    observer.observe(el);
  }

  return { observer, count: toObserve.length };
}
