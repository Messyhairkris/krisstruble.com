// Written by Hoss (crew), accepted against hidden tests 2026-09-28. Contract: crew/contracts/site_embed_cover.md
export const STATES = ["idle", "loading", "ready", "failed"];

export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) {
    return "";
  }
  if (n < 1000) {
    return `${Math.round(n)} bytes`;
  }
  let unit, v;
  if (n < 1e6) {
    unit = "KB";
    v = n / 1e3;
  } else if (n < 1e9) {
    unit = "MB";
    v = n / 1e6;
  } else {
    unit = "GB";
    v = n / 1e9;
  }
  let num;
  if (v < 10) {
    const rounded = Math.round(v * 10) / 10;
    num = `${rounded}`;
  } else {
    num = `${Math.round(v)}`;
  }
  return `${num} ${unit}`;
}

export function estimateSeconds(bytes, mbps) {
  if (!Number.isFinite(bytes) || !Number.isFinite(mbps) ||
      bytes < 0 || mbps <= 0) {
    return null;
  }
  const secs = Math.ceil((bytes * 8) / (mbps * 1e6));
  return secs < 1 ? 1 : secs;
}

const transitions = {
  idle: { activate: "loading" },
  loading: { load: "ready", error: "failed", timeout: "failed" },
  failed: { retry: "loading" }
};

export function nextState(state, event) {
  if (!STATES.includes(state)) {
    throw new Error("nextState: unknown state " + state);
  }
  if (Object.hasOwn(transitions, state) &&
      Object.hasOwn(transitions[state], event)) {
    return transitions[state][event];
  }
  return state;
}

export function coverLabel(state, { title, bytes = null, mbps = 25 }) {
  if (!STATES.includes(state)) {
    throw new Error("nextState: unknown state " + state);
  }
  const size = formatBytes(bytes);
  const secs = estimateSeconds(bytes, mbps);
  if (state === "idle") {
    return size !== "" ? `Load ${title} \u00B7 ${size}` : `Load ${title}`;
  }
  if (state === "loading") {
    return secs !== null
      ? `Loading ${title}\u2026 about ${secs} s`
      : `Loading ${title}\u2026`;
  }
  if (state === "failed") {
    return `${title} didn't load. Try again`;
  }
  return "";
}
