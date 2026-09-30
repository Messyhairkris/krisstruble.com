# Portfolio prototype (2026-09-28)

A rebuild of the portfolio as **one page per chapter**, drawn from four sites Kris liked:
Hannah Willcocks (only the chosen project shows), Krystin Savov (a fixed index), the Behance
architecture portfolio (clean, numbered contents) and David Blackwood (things drift into view).

The current site in `../Portfolio site` is untouched.

## What to look at

| Page | State |
|---|---|
| `index.html` | **Designed.** Intro, numbered contents tiles, about. |
| `scans.html` | **Designed.** The 3D viewer sits behind a loading cover and loads only when asked. |
| `freddi.html` | **Designed.** Film, the cast, loops, process. |
| the other seven | **Carried over** from the current site, in the new frame and type. Not redesigned yet. |

Things to try:
- Click a tile on the home page: the index stays still, the page cross-fades, and the tile's
  picture travels into the chapter's header. (Chrome/Edge 126+, Safari 18.2+; Firefox simply
  changes page.)
- Scroll a chapter: pictures and text drift up as they arrive, a few at a time.
- Field Scans: the viewer (23 MB) does not load with the page. Press the cover.
- Narrow the window below 900 px: the index moves behind an "Index" button.
- Turn on "reduce motion" in Windows (Settings → Accessibility → Visual effects → Animation
  effects: off): every movement stops; everything is simply there.

## Previewing

Pages use JavaScript modules, which browsers will not run from a file opened off the disk.
Double-click **`Preview prototype.cmd`** (next to this folder), or run from anywhere:

    python "C:\Users\MookieWilkens\Desktop\Touch-up Revised edition\Portfolio prototype\_build\serve.py"

then open http://127.0.0.1:5190/. Touch Up 0.3 can open this folder as a project as well.

## How it is made

- `css/site.css`: everything visual. The motion speeds are variables at the top
  (`--reveal-time`, `--reveal-rise`, `--page-fade`).
- `js/site.js`: the page script. It uses three small modules written by the crew against hidden
  tests: `chapters.js` (the chapter list, roman numerals, which page is current),
  `reveal.js` (drift-in, off for reduced motion) and `embed-cover.js` (the loading cover's
  states and words).
- **Loading cover** for any heavy embed:

  ```html
  <div class="embed" data-embed-src="scans/splat-viewer.html" data-embed-title="Field Scans"
       data-embed-bytes="22715821" style="--embed-accent:#e0a526">
    <img class="embed-poster" src="img/field-scans-poster.webp" alt="">
    <button class="embed-cover" type="button" hidden>
      <span class="embed-icon" aria-hidden="true"></span>
      <span class="embed-label">Load Field Scans</span>
    </button>
  </div>
  ```

  Restyle it with `--embed-bg`, `--embed-ink`, `--embed-accent`, `--embed-aspect`,
  `--embed-radius`, `--embed-dim`, `--embed-blur`. Add `data-embed-load="visible"` to load it
  when it scrolls into view instead of on a press.
- `_build/`: the scaffolding that assembled the pages (one shared index, carried-over chapters),
  plus the preview server and screenshot script. **Leave it out when publishing**: the current
  site has a `.nojekyll` file, so GitHub Pages would publish it. After the prototype is agreed,
  the pages are edited directly (in Touch Up), and `_build` can be deleted.
