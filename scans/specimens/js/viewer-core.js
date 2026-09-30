// viewer-core.js — the one renderer both the editor and the exported portfolio use.
// Keeping it shared means "what you tune" and "what a recruiter sees" are the same pixels.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

// A raw capture is mostly signal plus a halo of floaters. Framing on the absolute
// min/max would zoom out to include the worst stray splat, so we frame on a
// percentile of the opaque splats instead — that lands on the specimen every time.
const FRAME_PERCENTILE = 0.97;
const FRAME_MIN_OPACITY = 0.1;
const FRAME_AIR = 1.12;                 // a little breathing room around the specimen
const EXTENT_TRIM = 0.015;              // ignore the outer 1.5% per axis when sizing

// Distance that fits a box of half-extents {y, xz} in the view. Framing on a bounding
// *sphere* wastes the screen on these captures: a cave bear skull is 0.37 wide and 0.15
// tall, so a sphere sized by the widest axis leaves two thirds of the height empty. Fit
// height against the vertical FOV and width against the horizontal one, take whichever
// needs more room. Exported so camera tours orbit at exactly the distance the still
// framing chose.
export function frameDistance({ halfY, halfXZ }, fovDeg = 55, aspect = 16/9){
  const tan = Math.tan(fovDeg * Math.PI / 360);
  const distV = halfY  / tan;
  const distH = halfXZ / (tan * Math.max(aspect, 0.2));
  // The fit distance is measured to the *near face* of the specimen, so the half-depth
  // has to be added back — otherwise a wide, flat skull frames at a distance smaller than
  // its own half-width and the orbit passes straight through it. Either horizontal axis
  // can face the camera as it revolves, so the worst case is the larger of the two.
  return Math.max(distV, distH, 1e-5) * FRAME_AIR + halfXZ;
}

export class Stage {
  constructor(canvas){
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.01, 1000);
    this.camera.position.set(0, 0, 3);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // cap for phones
    this.spark = new SparkRenderer({ renderer:this.renderer });
    this.scene.add(this.spark);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.object = null;               // current SplatMesh
    this._onFrame = [];               // per-frame hooks (paths, hotspots)
    this._radius = 1; this._center = new THREE.Vector3();
    this._resize();
    // The canvas is laid out by CSS grid, so its size can change without the window
    // resizing (panel collapse, phone rotate). Observe the element, not just `resize`.
    if(typeof ResizeObserver !== 'undefined'){
      this._ro = new ResizeObserver(()=>this._resize()); this._ro.observe(canvas);
    }
    addEventListener('resize', ()=>this._resize());
    this.renderer.setAnimationLoop(t => this._tick(t));
  }
  onFrame(fn){ this._onFrame.push(fn); return ()=>{ this._onFrame = this._onFrame.filter(f=>f!==fn); }; }
  _tick(t){
    const dt = this._last ? Math.min((t-this._last)/1000, 0.1) : 0; this._last = t;
    for(const fn of this._onFrame) fn(dt, t);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
  _resize(){
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    if(w === this._w && h === this._h) return;
    this._w = w; this._h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w/h; this.camera.updateProjectionMatrix();
  }
  clear(){
    if(!this.object) return;
    this.scene.remove(this.object);
    this.object.dispose?.();
    this.object = null;
  }

  // Load a splat. Pass `fileBytes` (+ `fileName`) for a local pick, or `url` for a
  // hosted file. Bytes are preferred: Spark sniffs the magic number, so we skip the
  // extra blob-URL round trip and the leaked object URL that came with it.
  async loadSplat(src, orient={}, onProgress){
    this.clear();
    const opts = { onProgress };
    if(src instanceof ArrayBuffer)      opts.fileBytes = new Uint8Array(src);
    else if(src instanceof Uint8Array)  opts.fileBytes = src;
    else if(typeof src === 'string')    opts.url = src;
    else Object.assign(opts, src);     // {url} | {fileBytes, fileName}
    if(opts.fileBytes && opts.fileBytes.buffer && !opts.fileName && !opts.fileType) opts.fileName = 'model.ply';

    const mesh = new SplatMesh(opts);
    await mesh.initialized;            // wait for splat data before framing
    if(!mesh.numSplats) throw new Error('no splats found in that file');
    this.applyOrient(mesh, orient);
    this.scene.add(mesh); this.object = mesh;
    mesh.userData.stats = this._measure(mesh);
    this.frame();
    return mesh;
  }

  // One pass over the decoded splats: opaque-only centroid, a sorted radius list for
  // percentile framing, the true min/max, and the centers themselves (kept for picking).
  // Cached on the mesh — the camera reads it on every re-frame, so it must not re-walk
  // 130k splats each time.
  _measure(mesh){
    const n = mesh.numSplats;
    const cx = new Float32Array(n), cy = new Float32Array(n), cz = new Float32Array(n);
    const op = new Float32Array(n);
    const sz = new Float32Array(n);     // largest axis scale — lets Clean work on any format
    const centroid = new THREE.Vector3();
    const min = new THREE.Vector3(Infinity,Infinity,Infinity);
    const max = new THREE.Vector3(-Infinity,-Infinity,-Infinity);
    let opaque = 0;
    mesh.forEachSplat((i, center, scales, quat, opacity) => {
      cx[i]=center.x; cy[i]=center.y; cz[i]=center.z; op[i]=opacity;
      sz[i]=Math.max(scales.x, scales.y, scales.z);
      min.min(center); max.max(center);
      if(opacity >= FRAME_MIN_OPACITY){ centroid.add(center); opaque++; }
    });
    if(!opaque){                       // everything is faint — fall back to the full set
      for(let i=0;i<n;i++) centroid.add(new THREE.Vector3(cx[i],cy[i],cz[i]));
      opaque = n;
    }
    centroid.divideScalar(opaque || 1);

    // Trimmed per-axis extents: sort each axis and clip the outer 1.5%, so a handful of
    // stray splats can't drag the frame out. Also gives the box centre, which is a better
    // thing to orbit than the centroid when a capture is denser at one end.
    const useAll = opaque === n;
    const pick = arr => {
      const v = new Float64Array(useAll ? n : opaque);
      for(let i=0,k=0;i<n;i++){ if(!useAll && op[i] < FRAME_MIN_OPACITY) continue; v[k++]=arr[i]; }
      v.sort();
      const lo = v[Math.floor(v.length*EXTENT_TRIM)], hi = v[Math.min(v.length-1, Math.floor(v.length*(1-EXTENT_TRIM)))];
      return { lo, hi, mid:(lo+hi)/2, half:Math.max((hi-lo)/2, 1e-6) };
    };
    const ax = pick(cx), ay = pick(cy), az = pick(cz);
    const center = new THREE.Vector3(ax.mid, ay.mid, az.mid);
    const half = new THREE.Vector3(ax.half, ay.half, az.half);
    const radius = Math.max(half.x, half.y, half.z);

    return { centroid, center, half, radius, min, max, count:n, opaque, cx, cy, cz, op, sz };
  }

  // Most phone captures (Scaniverse et al.) come in Y-down; this flips them upright.
  applyOrient(o, { flip=true, rotY=0, scale=1, offset=[0,0,0] }={}){
    o.quaternion.set(flip?1:0, 0, 0, flip?0:1);  // 180deg about X when flipped
    o.rotateY(rotY);
    o.scale.setScalar(scale);
    o.position.set(offset[0], offset[1], offset[2]);
    o.updateMatrixWorld(true);
  }

  // Point the orbit target at the specimen and pull the camera to a sensible distance.
  // A Spark SplatMesh has no geometry (splats live in a texture, drawn by SparkRenderer),
  // so Box3.setFromObject returns an empty box — we use our own measured stats instead.
  frame(){
    const o = this.object; if(!o) return;
    o.updateMatrixWorld(true);
    const s = o.userData.stats || this._measure(o);
    const k = o.scale.x;
    const c = s.center.clone().applyMatrix4(o.matrixWorld);
    // rotY spins the specimen about Y, so either horizontal axis can face the camera.
    const box = { halfY: s.half.y * k, halfXZ: Math.max(s.half.x, s.half.z) * k };
    const dist = frameDistance(box, this.camera.fov, this.camera.aspect);
    const r = Math.max(s.radius * k, 1e-4);
    this.controls.target.copy(c);
    this.camera.position.copy(c).add(new THREE.Vector3(0, box.halfY*0.45, dist));
    this.camera.near = Math.max(dist/1000, 1e-4); this.camera.far = dist*20;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = r*0.05; this.controls.maxDistance = dist*8;
    this.controls.update();
    this._radius = r; this._center = c; this._dist = dist; this._box = box;
  }

  // Screen point -> splat surface, for dropping hotspot markers.
  //
  // Spark's own SplatMesh.raycast() returns nothing here: it reads splat count from its
  // LOD generator context, which stays 0 for a plain non-paged mesh, so it bails before
  // testing anything. We already decode every center in _measure(), so we pick against
  // those instead — frontmost splat within a small radius of the ray, ignoring the faint
  // ones you never meant to click.
  raycast(ndc){
    const o = this.object; if(!o) return null;
    const s = o.userData.stats; if(!s?.cx) return null;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), this.camera);

    // Work in object space so one inverse replaces a per-splat matrix multiply.
    const inv = o.matrixWorld.clone().invert();
    const org = rc.ray.origin.clone().applyMatrix4(inv);
    const dir = rc.ray.direction.clone().transformDirection(inv).normalize();

    const tol = s.radius * 0.03;         // a marker should land near what you aimed at
    const tol2 = tol*tol;
    let bestT = Infinity, bestI = -1;
    const {cx, cy, cz, op, count} = s;
    for(let i=0;i<count;i++){
      if(op[i] < 0.25) continue;
      const px = cx[i]-org.x, py = cy[i]-org.y, pz = cz[i]-org.z;
      const t = px*dir.x + py*dir.y + pz*dir.z;
      if(t <= 0 || t >= bestT) continue;
      const perp2 = (px*px + py*py + pz*pz) - t*t;
      if(perp2 > tol2) continue;
      bestT = t; bestI = i;
    }
    if(bestI < 0) return null;
    const local = new THREE.Vector3(cx[bestI], cy[bestI], cz[bestI]);
    return { index:bestI, distance:bestT, localPoint:local,
             point:local.clone().applyMatrix4(o.matrixWorld) };
  }
}
