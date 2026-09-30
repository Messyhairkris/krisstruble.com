// camera-paths.js — explicit-state camera tours. A path is plain JSON you can read,
// diff, and hand-edit. Presets are just pre-seeded waypoint sets, so "custom", "arc" and
// "revolve" share one playback engine.
import * as THREE from 'three';

// --- easing ------------------------------------------------------------------
// A constant-speed orbit reads as machinery; easing in and out of each move is most of
// what makes a tour look authored. Applied to the fraction along a segment, never to the
// clock, so segment durations stay exactly what you typed.
export const EASINGS = {
  linear:     t => t,
  easeIn:     t => t*t,
  easeOut:    t => 1 - (1-t)*(1-t),
  easeInOut:  t => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2,
  easeInOutSine: t => -(Math.cos(Math.PI*t) - 1)/2,
};
export const EASING_NAMES = Object.keys(EASINGS);
const ease = (name, t) => (EASINGS[name] || EASINGS.linear)(t);

// --- pure generators (waypoint arrays). Kept side-effect-free so they're testable. ---
export function revolveWaypoints({ center=[0,0,0], radius=3, height=0.4, samples=48 }={}){
  const w=[]; for(let i=0;i<samples;i++){ const a=i/samples*Math.PI*2;
    w.push({ pos:[center[0]+Math.cos(a)*radius, center[1]+height, center[2]+Math.sin(a)*radius], target:center }); }
  return w; // closed loop
}

// An arc between two angles instead of the full circle. This is the one that matters for
// a single-sided capture: scan a specimen from the front only and the back is hollow with
// reversed normals, so a full revolve swings the viewer through the ugly side. Sweep
// between two bearings and bounce instead, and they only ever see the good half.
export function arcWaypoints({ center=[0,0,0], radius=3, height=0.4, startDeg=-60, endDeg=60, samples=24 }={}){
  const w=[]; const a0 = startDeg*Math.PI/180, a1 = endDeg*Math.PI/180;
  const n = Math.max(2, samples|0);
  for(let i=0;i<n;i++){
    const a = a0 + (a1-a0) * (i/(n-1));
    w.push({ pos:[center[0]+Math.sin(a)*radius, center[1]+height, center[2]+Math.cos(a)*radius], target:center });
  }
  return w;
}

// A straight dolly across the front of the subject. It used to fly between fixed points at
// ±3 around the origin whatever the model was — fine for a 0.3-unit skull by accident,
// and inside the scene for a street-art capture with a radius near 7. It is now built from
// the same centre / radius / height the stage measured. Explicit from/to still win.
export function flybyWaypoints({ from, to, look, center=[0,0,0], radius=3, height=0.4,
                                 startDeg=-35, endDeg=35 }={}){
  const c = look || center;
  const at = deg => {
    // tan() runs away past ~50°: at the stored default of 60° a large scene put the camera
    // twelve units off to the side. Clamp so the dolly stays in front of the subject.
    const a = Math.max(-50, Math.min(50, deg)) * Math.PI / 180;
    // Travel along a line tangent to the front of the orbit, not around it.
    return [c[0] + Math.tan(a) * radius, c[1] + height, c[2] + radius];
  };
  return [{ pos: from || at(startDeg), target: c }, { pos: to || at(endDeg), target: c }];
}

export function waypointsFor(path){
  if(path.type==='revolve')  return { pts:revolveWaypoints(path), closed:true };
  if(path.type==='pingpong') return { pts:arcWaypoints(path),     closed:false };
  if(path.type==='flyby')    return { pts:flybyWaypoints(path),   closed:false };
  return { pts:path.waypoints||[], closed:!!path.closed };        // custom
}

// A path authored against one specimen shouldn't be reused verbatim on the next —
// seed its radius/height from what the stage actually measured.
export function fitPathToStage(path, stage){
  const c = stage._center;
  if(!c) return path;
  path.center = [c.x, c.y, c.z];
  if(path.type === 'revolve' || path.type === 'pingpong' || path.type === 'flyby'){
    // Reuse the distance frame() just computed rather than re-deriving it — otherwise
    // "Preview tour" shows the specimen at a different size than the shot you composed.
    path.radius = +(stage._dist || stage._radius * 2.5).toFixed(4);
    path.height = +((stage._box?.halfY ?? stage._radius) * 0.45).toFixed(4);
  }
  return path;
}

// --- playback ---
// Two timing models share one class:
//   uniform  — the whole path takes `seconds`, easing applied across the whole run.
//              Used by revolve, pingpong and flyby.
//   timeline — each custom waypoint carries its own `travel` (seconds to reach it) and
//              `hold` (seconds to sit still on arrival), each segment eased separately.
//              This is what lets a tour pause on a detail before moving on.
export class Player {
  constructor(stage, path){
    this.stage = stage;
    this.setPath(path);
    this.playing = false;
    this.loop = true;
    this.onLap = null;           // called each time a full pass completes
    this.laps = 0;
  }

  setPath(path){
    this.path = path;
    // A fly-by is a straight dolly, so looping it would cut from the far end back to the
    // start every pass. It goes out and back like ping-pong instead.
    this.bounce = path.type === 'pingpong' || path.type === 'flyby' || !!path.bounce;
    this.easing = path.easing || (this.bounce ? 'easeInOut' : 'linear');
    const { pts, closed } = waypointsFor(path);
    this.closed = closed;
    this.pts = pts;
    if(pts.length < 2){ this.posCurve = null; this.tgtCurve = null; this.duration = 0; return; }

    const P = pts.map(p=>new THREE.Vector3(...p.pos));
    const T = pts.map(p=>new THREE.Vector3(...(p.target||[0,0,0])));
    this.posCurve = new THREE.CatmullRomCurve3(P, closed, 'centripetal');
    this.tgtCurve = new THREE.CatmullRomCurve3(T, closed, 'centripetal');

    this.timeline = (path.type === 'custom' && pts.some(p => p.travel != null || p.hold != null))
      ? buildTimeline(pts, closed, path)
      : null;
    this.duration = this.timeline ? this.timeline.total : (path.seconds || 12);
    this.t = 0;
  }

  // Position along the path for a given elapsed time, in seconds.
  sampleAt(t){
    if(!this.posCurve) return null;
    let u;
    if(this.timeline){
      u = this.timeline.uAt(t);
    } else {
      let f = this.duration > 0 ? (t / this.duration) : 0;
      f = this.closed ? (f % 1 + 1) % 1 : Math.min(Math.max(f, 0), 1);
      if(this.bounce) f = f <= 0.5 ? f*2 : (1 - f)*2;   // out and back within one pass
      u = ease(this.easing, Math.min(Math.max(f, 0), 1));
    }
    // Uniform paths walk by arc length so speed is even; timelines address waypoints
    // directly, which is what makes a per-waypoint duration mean what it says.
    const get = this.timeline ? 'getPoint' : 'getPointAt';
    const uu = this.closed ? (u % 1 + 1) % 1 : Math.min(Math.max(u, 0), 1);
    return { position:this.posCurve[get](uu), target:this.tgtCurve[get](uu) };
  }
  sample(u){ return this.sampleAt(u * (this.duration || 1)); }

  play(){ this.playing = true; }
  pause(){ this.playing = false; }
  reset(){ this.t = 0; this.laps = 0; }

  // returns true on the frame a non-looping path finishes.
  // An unplayable path (fewer than two waypoints) reports done immediately so callers
  // waiting on the intro don't stall forever.
  update(dt){
    if(!this.playing) return false;
    if(!this.posCurve){ this.playing = false; return true; }
    this.t += dt;
    let done = false;
    if(this.t >= this.duration){
      this.laps++;
      this.onLap?.(this.laps);
      if(this.loop){ this.t = this.duration ? this.t % this.duration : 0; }
      else { this.t = this.duration; this.playing = false; done = true; }
    }
    const s = this.sampleAt(this.t);
    if(s){
      this.stage.camera.position.copy(s.position);
      this.stage.controls.target.copy(s.target);
    }
    return done;
  }

  // Back-compat for callers that set a whole-path duration.
  set loopSeconds(v){ if(!this.timeline) this.duration = v; }
  get loopSeconds(){ return this.duration; }
}

// travel = seconds to move from the previous waypoint to this one.
// hold   = seconds to sit still once it arrives.
function buildTimeline(pts, closed, path){
  const defTravel = path.travel ?? 2;
  const segs = [];
  let total = 0;
  const n = pts.length;
  const last = closed ? n : n - 1;
  for(let i=0;i<last;i++){
    const from = i, to = (i+1) % n;
    const hold = Math.max(0, pts[from].hold ?? 0);
    if(hold > 0){ segs.push({ kind:'hold', u:from/(closed ? n : n-1), t0:total, t1:total+hold }); total += hold; }
    const travel = Math.max(0.01, pts[to].travel ?? defTravel);
    segs.push({
      kind:'move', t0:total, t1:total+travel,
      u0:from/(closed ? n : n-1), u1:(from+1)/(closed ? n : n-1),
      ease: pts[to].easing || path.easing || 'easeInOut',
    });
    total += travel;
  }
  const tailHold = Math.max(0, pts[closed ? 0 : n-1].hold ?? 0);
  if(!closed && tailHold > 0){ segs.push({ kind:'hold', u:1, t0:total, t1:total+tailHold }); total += tailHold; }

  return {
    total: total || 0.01,
    uAt(t){
      const clamped = Math.min(Math.max(t, 0), this.total);
      for(const s of segs){
        if(clamped > s.t1) continue;
        if(s.kind === 'hold') return s.u;
        const f = (clamped - s.t0) / Math.max(1e-6, s.t1 - s.t0);
        return s.u0 + (s.u1 - s.u0) * ease(s.ease, Math.min(Math.max(f, 0), 1));
      }
      return 1;
    },
  };
}

// Hybrid behaviour: lead with the tour once; then loop OR hand control to the viewer,
// resuming the auto-demo after a spell of no interaction. One small explicit state machine.
//
// The handoff listens on the canvas rather than on OrbitControls' own `start` event:
// controls are disabled while the tour drives the camera (otherwise the user's drag and
// the curve fight over the same position), and a disabled OrbitControls emits nothing —
// so watching it would mean the viewer could never take over.
export function attachHybrid(stage, player, { idleMs=6000, onPass=null }={}){
  let state='intro'; // intro -> (loop | manual) ; manual --idle--> loop
  let idleTimer=null;
  let passes = 0;
  const bumpPass = ()=>{ passes++; onPass?.(passes, state); };
  const auto = ()=>{ state='loop'; stage.controls.enabled=false; player.loop=true; player.play(); };
  const goManual = ()=>{
    state='manual'; player.pause(); stage.controls.enabled=true;
    clearTimeout(idleTimer); idleTimer=setTimeout(auto, idleMs);
  };
  const el = stage.canvas;
  const TAKEOVER = ['pointerdown','wheel','touchstart','keydown'];
  TAKEOVER.forEach(e=> el.addEventListener(e, goManual, {passive:true}));

  player.onLap = bumpPass;
  player.loop=false; player.reset(); player.play();
  stage.controls.enabled=false;          // intro plays once, uninterrupted-ish
  const off = stage.onFrame(dt=>{
    if(state==='intro' && player.update(dt)) auto();
    else if(state==='loop') player.update(dt);
  });
  return {
    get state(){ return state; },
    get passes(){ return passes; },
    dispose(){
      off(); clearTimeout(idleTimer);
      player.onLap = null;
      TAKEOVER.forEach(e=> el.removeEventListener(e, goManual));
      stage.controls.enabled = true;     // never leave the viewer with a frozen camera
    }
  };
}
