// hotspots.js — markers anchored in the model, drawn as DOM over the canvas.
//
// Projected per frame rather than rendered as 3D sprites: labels stay crisp at any
// distance, the text is real selectable text, and the same code serves the editor's
// authoring view and the published page. Anchors are stored in the model's *local*
// space, so flipping or re-scaling the specimen carries the markers with it.
import * as THREE from 'three';

export const REVEAL_MODES = {
  always:     'Visible immediately',
  afterFirst: 'Appear after the first pass',
  secondPass: 'Appear during the second pass',
  manual:     'Only when the viewer asks',
};

export const DEFAULT_STYLE = { color:'#7ea8a0', showNumbers:true, reveal:'afterFirst' };

export class Hotspots {
  // `onSelect(index|null)` fires when a marker is clicked. Omit for a read-only overlay.
  constructor(stage, layer, { onSelect=null, interactive=true, style=null }={}){
    this.stage = stage; this.layer = layer;
    this.onSelect = onSelect; this.interactive = interactive;
    this.items = [];
    this.selected = null;
    this.visible = true;
    this.style = { ...DEFAULT_STYLE, ...(style||{}) };
    this._v = new THREE.Vector3();
    this._cam = new THREE.Vector3();
    this._off = stage.onFrame(()=>this._project());
  }

  set(items){
    this.items = items || [];
    this.layer.textContent = '';
    this.els = this.items.map((h,i)=>{
      const el = document.createElement('button');
      el.className = 'hs';
      el.type = 'button';
      el.title = h.title || '';
      if(this.interactive) el.onclick = ()=>{ this.select(this.selected===i ? null : i); };
      else el.tabIndex = -1;
      this.layer.appendChild(el);
      return el;
    });
    this.applyStyle();
    this.select(null);
  }

  // Numbers off turns each marker into a plain dot — better on a busy specimen where the
  // digits fight the texture, and the card still names what you clicked.
  setStyle(patch){ this.style = { ...this.style, ...patch }; this.applyStyle(); }
  applyStyle(){
    const { color, showNumbers } = this.style;
    this.layer.style.setProperty('--hs-color', color || DEFAULT_STYLE.color);
    this.layer.classList.toggle('no-numbers', !showNumbers);
    this.els?.forEach((el,i)=>{
      el.textContent = showNumbers ? String(this.items[i].n ?? (i+1)) : '';
      el.setAttribute('aria-label', this.items[i].title || `Detail ${this.items[i].n ?? i+1}`);
      if(this.items[i].color) el.style.setProperty('--hs-color', this.items[i].color);
    });
  }

  setVisible(on){
    this.visible = !!on;
    this.layer.classList.toggle('hs-hidden', !this.visible);
    if(!this.visible) this.select(null);
  }

  // Given how many tour passes have completed, should the markers be showing yet?
  revealFor(passes){
    switch(this.style.reveal){
      case 'always':     return true;
      case 'afterFirst': return passes >= 1;
      case 'secondPass': return passes >= 1;   // shown *during* pass two, and kept after
      case 'manual':     return false;
      default:           return true;
    }
  }

  select(i){
    if(!this.visible) i = null;
    this.selected = i;
    this.els?.forEach((el,k)=> el.classList.toggle('on', k===i));
    this.onSelect?.(i);
  }

  // Depth-sort so a marker on the far side sits behind the specimen rather than floating
  // over it, and hide anything behind the camera (projection flips sign there).
  _project(){
    const o = this.stage.object; if(!o || !this.els?.length || !this.visible) return;
    const cam = this.stage.camera;
    const rect = this.stage.canvas.getBoundingClientRect();
    cam.getWorldPosition(this._cam);
    for(let i=0;i<this.items.length;i++){
      const el = this.els[i], a = this.items[i].anchor;
      if(!a){ el.style.display='none'; continue; }
      this._v.set(a[0],a[1],a[2]).applyMatrix4(o.matrixWorld);
      const dist = this._v.distanceTo(this._cam);
      this._v.project(cam);
      if(this._v.z > 1 || this._v.z < -1){ el.style.display='none'; continue; }
      el.style.display = '';
      el.style.left = ((this._v.x*0.5+0.5) * rect.width)  + 'px';
      el.style.top  = ((-this._v.y*0.5+0.5) * rect.height) + 'px';
      el.style.zIndex = String(Math.max(1, 10000 - Math.round(dist*1000)));
      el.style.opacity = this._v.z > 0.999 ? '0.35' : '1';
    }
  }
  dispose(){ this._off?.(); this.layer.textContent=''; this.els=null; }
}
