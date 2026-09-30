// viewer.js — the published page. Same Stage, same Player, same Hotspots as the editor,
// so what you tuned is what a visitor sees.
import { Stage } from '../js/viewer-core.js';
import { Player, attachHybrid } from '../js/camera-paths.js';
import { Hotspots, DEFAULT_STYLE } from '../js/hotspots.js';
import { fromJSON } from '../js/store.js';

const $ = s => document.querySelector(s);
const fail = m => { $('#fail').hidden = false; $('#fail').textContent = m; console.error(m); };

let stage, spots, player, hybrid, pf, current = -1, token = 0;

try { stage = new Stage($('#stage')); }
catch(e){ fail('This page needs WebGL2. ' + (e.message||e)); throw e; }

spots = new Hotspots(stage, $('#spots'), { onSelect: showCard });

// ---- chrome -----------------------------------------------------------------
const menu = $('#menu'), panel = $('#panel'), card = $('#card');
$('#menu-btn').onclick = ()=>{
  menu.hidden = !menu.hidden;
  $('#menu-btn').setAttribute('aria-expanded', String(!menu.hidden));
};
$('#info').onclick = ()=>{
  panel.hidden = !panel.hidden;
  $('#info').setAttribute('aria-pressed', String(!panel.hidden));
};
$('#panel-x').onclick = ()=> { panel.hidden = true; $('#info').setAttribute('aria-pressed','false'); };
$('#card-x').onclick  = ()=> spots.select(null);
$('#tour').onclick = ()=> setTour($('#tour').getAttribute('aria-pressed') !== 'true');
$('#details').onclick = () => {
  const on = !spots.visible;
  spots.setVisible(on); syncDetailsBtn(on);
};

addEventListener('keydown', e=>{
  if(e.key === 'Escape'){ menu.hidden = true; panel.hidden = true; spots.select(null); $('#info').setAttribute('aria-pressed','false'); }
  if(e.key === 'ArrowRight') show(current+1);
  if(e.key === 'ArrowLeft')  show(current-1);
});

function showCard(i){
  const h = i==null ? null : pf.models[pf.order[current]].hotspots[i];
  card.hidden = !h;
  if(h){ $('#card-title').textContent = h.title || `Detail ${h.n}`; $('#card-body').textContent = h.body || ''; }
}

function syncDetailsBtn(on){
  const b = $('#details');
  if(!b) return;
  const any = (pf?.models[pf.order[current]]?.hotspots || []).length > 0;
  b.hidden = !any;
  b.setAttribute('aria-pressed', String(!!on));
}

function setTour(on){
  $('#tour').setAttribute('aria-pressed', String(on));
  hybrid?.dispose(); hybrid = null;
  if(player){ player.pause(); player = null; }
  stage.controls.enabled = true;
  if(!on || current < 0){
    // With the tour off there is no pass counter, so markers are simply available.
    if(current >= 0 && spots.style.reveal !== 'manual'){ spots.setVisible(true); syncDetailsBtn(true); }
    return;
  }
  const m = pf.models[pf.order[current]];
  player = new Player(stage, tourPathFor(m));
  // Markers stay out of the way for the opening pass so the specimen lands first, then
  // appear and stay. The mode comes from the portfolio document.
  hybrid = attachHybrid(stage, player, {
    idleMs: 7000,
    onPass: n => { const on = spots.revealFor(n); spots.setVisible(on); syncDetailsBtn(on); },
  });
  const initial = spots.revealFor(0);
  spots.setVisible(initial); syncDetailsBtn(initial);
}

// The revolve radius was authored against the editor's viewport. A phone in portrait is
// far narrower, so the same orbit crops the specimen — never orbit closer than the
// distance this screen actually needs. Widening only; a deliberately tight tour stays tight
// on wide screens.
function tourPathFor(m){
  const path = { ...m.path };
  if(['revolve','pingpong','flyby'].includes(path.type) && stage._dist > path.radius){
    const k = stage._dist / path.radius;
    path.radius = stage._dist;
    path.height = (path.height ?? 0) * k;
  }
  return path;
}

// ---- loading ----------------------------------------------------------------
const loading = $('#loading');
function progress(pct, text){
  loading.classList.remove('done');
  $('#loadbar').style.width = (pct*100).toFixed(0) + '%';
  $('#loadtext').textContent = text;
}
const doneLoading = ()=> loading.classList.add('done');

async function show(i){
  if(!pf?.order.length) return;
  i = (i % pf.order.length + pf.order.length) % pf.order.length;   // wrap both ways
  const id = pf.order[i], m = pf.models[id];
  if(!m) return;
  const mine = ++token;                     // a fast click-through must not race
  current = i;
  renderGallery(); renderDocs(m);
  spots.set([]); card.hidden = true;
  setTour(false);
  $('#fail').hidden = true;

  // A single-file export (one .html that opens by double-click) carries its models
  // inside the page and hands them over as bytes: from file:// the renderer's worker
  // may not fetch anything, not even a blob: URL.
  const packed = m.publish?.file && window.SPLAT_PACKED?.asset(m.publish.file);
  const src = packed || (m.publish?.file ? '../assets/' + m.publish.file : m.assetUrl);
  if(!src){
    doneLoading();     // otherwise "Loading…" sits under the error forever
    return fail(`"${m.title || m.file}" has no published file. In the editor: Clean → Build .spz, then Export site.`);
  }
  try{
    progress(0.05, 'Loading ' + (m.title || m.file) + '…');
    await stage.loadSplat(src, m.orient, p => {
      if(mine === token && p?.total) progress(0.05 + 0.9*(p.loaded/p.total), Math.round(100*p.loaded/p.total) + '%');
    });
    if(mine !== token) return;              // superseded while fetching
    progress(1, 'Ready');
    doneLoading();
    spots.set(m.hotspots || []);
    setTour(true);
    syncDetailsBtn(spots.visible);
    history.replaceState(null, '', '#' + encodeURIComponent(id));
  }catch(e){
    if(mine === token){ doneLoading(); fail('Could not load ' + src + '\n' + (e.message||e)); }
  }
}

function renderGallery(){
  const ol = $('#gallery'); ol.textContent = '';
  pf.order.forEach((id, i) => {
    const m = pf.models[id];
    const li = document.createElement('li');
    li.setAttribute('aria-current', String(i === current));
    const num = document.createElement('span'); num.className='num'; num.textContent = String(i+1).padStart(2,'0');
    const t = document.createElement('span'); t.className='t';
    t.textContent = m.title || m.file;
    if(m.docs?.auto?.splats){
      const s = document.createElement('small');
      s.textContent = m.docs.auto.splats.toLocaleString() + ' splats';
      t.appendChild(s);
    }
    li.append(num, t);
    li.onclick = ()=>{ show(i); if(innerWidth < 680) menu.hidden = true; };
    ol.appendChild(li);
  });
}

function renderDocs(m){
  $('#d-title').textContent = m.title || m.file;
  $('#d-desc').textContent = m.docs?.description || '';
  $('#d-credits').textContent = m.docs?.credits || '';
  const dl = $('#d-facts'); dl.textContent = '';
  const a = m.docs?.auto || {};
  const facts = [
    ['Splats', a.splats?.toLocaleString()],
    ['Published', m.publish ? `${m.publish.format.toUpperCase()} · SH ${m.publish.sh}` : a.format?.toUpperCase()],
    ['File size', (m.publish?.bytes ?? a.bytes) ? fmt(m.publish?.bytes ?? a.bytes) : null],
    ['Extent', a.extent ? a.extent.map(v=>v.toFixed(2)).join(' × ') : null],
    ['Details', m.hotspots?.length ? String(m.hotspots.length) : null],
  ];
  for(const [k,v] of facts){
    if(v == null) continue;
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
}
const fmt = b => b >= 1e6 ? (b/1e6).toFixed(1)+' MB' : Math.round(b/1024)+' kB';

// ---- boot -------------------------------------------------------------------
(async ()=>{
  try{
    let text = window.SPLAT_PACKED?.portfolio;
    if(text == null){
      const r = await fetch('../data/portfolio.json', { cache:'no-store' });
      if(!r.ok) throw new Error(`data/portfolio.json — HTTP ${r.status}`);
      text = await r.text();
    }
    pf = fromJSON(text);
  }catch(e){
    doneLoading();
    return fail('No portfolio to show.\n' + (e.message||e) +
      '\n\nIn the editor: add models to the portfolio, then Export site.');
  }
  spots.setStyle({ ...DEFAULT_STYLE, ...(pf.markers || {}) });
  document.title = pf.title || 'Specimens';
  $('#pf-title').textContent = pf.title || 'Specimens';
  $('#pf-tagline').textContent = pf.tagline || '';
  if(!pf.order?.length){ doneLoading(); return fail('The portfolio is empty.'); }
  renderGallery();
  const want = decodeURIComponent(location.hash.slice(1));
  const at = pf.order.indexOf(want);
  // Open on the first model that can actually load, so one bad entry doesn't greet every
  // visitor with an error when the rest of the gallery is fine.
  const playable = pf.order.findIndex(id => pf.models[id]?.publish?.file || pf.models[id]?.assetUrl);
  show(at >= 0 ? at : Math.max(0, playable));
})();

// Console handle. A published page that renders nothing is the worst thing to debug
// remotely; this makes "what does the camera actually think it's looking at" a one-liner.
window.splatViewer = {
  stage, spots,
  get portfolio(){ return pf; },
  get index(){ return current; },
  get model(){ return pf?.models[pf.order[current]]; },
  get state(){
    const o = stage.object, s = o?.userData?.stats;
    return {
      loaded: !!o, splats: o?.numSplats,
      camera: stage.camera.position.toArray().map(v=>+v.toFixed(4)),
      target: stage.controls.target.toArray().map(v=>+v.toFixed(4)),
      dist: +stage.camera.position.distanceTo(stage.controls.target).toFixed(4),
      near: stage.camera.near, far: stage.camera.far,
      center: s?.center?.toArray().map(v=>+v.toFixed(4)),
      half: s?.half?.toArray().map(v=>+v.toFixed(4)),
      frameDist: stage._dist, visible: o?.visible,
    };
  },
};
