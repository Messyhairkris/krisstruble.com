// Written by Qwen (crew), accepted against hidden tests 2026-09-28. Contract: crew/contracts/site_chapters.md
export const CHAPTERS = [
  {
    n: 1,
    slug: "kit",
    title: "The Insect Spreading Kit",
    tag: "Product Design",
  },
  {
    n: 2,
    slug: "scans",
    title: "Field Scans",
    tag: "Creative Technology / Software",
  },
  {
    n: 3,
    slug: "classes",
    title: "Classes as a System",
    tag: "Education & Program Design",
  },
  {
    n: 4,
    slug: "systems",
    title: "Systems & Documentation",
    tag: "Systems / Automation",
  },
  {
    n: 5,
    slug: "illustration",
    title: "Scientific Illustration",
    tag: "Visual Communication",
  },
  {
    n: 6,
    slug: "accents",
    title: "Accent Picker",
    tag: "Tools / Automation",
  },
  {
    n: 7,
    slug: "motion",
    title: "Motion, Prototypes & Sets",
    tag: "Motion / Interaction / Prototyping",
  },
  {
    n: 8,
    slug: "freddi",
    title: "Freddi Yeti",
    tag: "Character / Physical Making",
  },
  {
    n: 9,
    slug: "events",
    title: "Nychos & the Artist Showcase",
    tag: "Event Production / Collaboration",
  },
];

const ROMAN_VALUES = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
const ROMAN_SYMBOLS = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];

export function toRoman(n) {
  if (!Number.isInteger(n) || n < 1 || n > 3999) {
    throw new RangeError("toRoman: 1 to 3999");
  }
  let rest = n;
  let out = "";
  for (let i = 0; i < ROMAN_VALUES.length; i += 1) {
    while (rest >= ROMAN_VALUES[i]) {
      out += ROMAN_SYMBOLS[i];
      rest -= ROMAN_VALUES[i];
    }
  }
  return out;
}

export function slugFromPath(path) {
  if (typeof path !== "string") {
    return "";
  }
  let text = path;
  const query = text.indexOf("?");
  const hash = text.indexOf("#");
  let cut = -1;
  if (query !== -1) {
    cut = query;
  }
  if (hash !== -1 && (cut === -1 || hash < cut)) {
    cut = hash;
  }
  if (cut !== -1) {
    text = text.slice(0, cut);
  }
  while (text.endsWith("/")) {
    text = text.slice(0, -1);
  }
  const slash = text.lastIndexOf("/");
  if (slash !== -1) {
    text = text.slice(slash + 1);
  }
  if (text.endsWith(".html")) {
    text = text.slice(0, -5);
  }
  if (text === "index") {
    return "";
  }
  return text;
}

export function findChapter(slug, chapters = CHAPTERS) {
  for (const chapter of chapters) {
    if (chapter.slug === slug) {
      return chapter;
    }
  }
  return null;
}

export function neighbours(slug, chapters = CHAPTERS) {
  const index = chapters.findIndex((chapter) => chapter.slug === slug);
  if (index === -1) {
    return { prev: null, next: null };
  }
  return {
    prev: index > 0 ? chapters[index - 1] : null,
    next: index < chapters.length - 1 ? chapters[index + 1] : null,
  };
}

export function markCurrent(links, path) {
  const here = slugFromPath(path);
  let marked = 0;
  for (const link of links) {
    if (slugFromPath(link.href) === here) {
      link.setAttribute("aria-current", "page");
      marked += 1;
    } else {
      link.removeAttribute("aria-current");
    }
  }
  return marked;
}
