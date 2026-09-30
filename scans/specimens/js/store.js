// store.js — the whole portfolio is one plain-JSON document. Sparse and explicit:
// every model is a Profile; the Portfolio is an ordered set of them. This is the file
// the exported viewer reads and the file you can commit, diff, and hand-edit.

export const SCHEMA = 1;

export function newProfile(id, file, format){
  return {
    id, file, format,
    title: '',
    orient:  { flip:true, rotY:0, scale:1, offset:[0,0,0] },
    cleanup: { minAlpha:0, maxScale:Infinity, aabb:null },   // Infinity/null => untouched
    path:    { type:'revolve', center:[0,0,0], radius:3, height:0.4, samples:48, seconds:12,
               startDeg:-60, endDeg:60, easing:'easeInOut' },   // startDeg/endDeg drive 'pingpong'
    hotspots: [],                                            // {id,anchor:[x,y,z],n,title,body,images:[]}
    docs:    { auto:{}, description:'', credits:'' },        // auto filled at import; description is yours
  };
}

export function newPortfolio(){
  return { schema:SCHEMA, title:'', tagline:'', order:[], models:{}, theme:'specimen',
           // How detail markers behave on the published page.
           markers:{ reveal:'afterFirst', showNumbers:true, color:'#7ea8a0' } };
}

export function addModel(pf, profile){
  pf.models[profile.id] = profile;
  if(!pf.order.includes(profile.id)) pf.order.push(profile.id);
  return pf;
}
export function removeModel(pf, id){
  delete pf.models[id]; pf.order = pf.order.filter(x=>x!==id); return pf;
}
export function reorder(pf, id, dir){                        // dir: -1 up, +1 down
  const i = pf.order.indexOf(id), j = i+dir;
  if(i<0||j<0||j>=pf.order.length) return pf;
  [pf.order[i], pf.order[j]] = [pf.order[j], pf.order[i]]; return pf;
}

// Infinity doesn't survive JSON; sentinel it so cleanup thresholds round-trip.
export function toJSON(pf){
  return JSON.stringify(pf, (k,v)=> v===Infinity ? '__inf__' : v, 2);
}
export function fromJSON(str){
  return JSON.parse(str, (k,v)=> v==='__inf__' ? Infinity : v);
}

const KEY = 'splat-portfolio';
export function save(pf){ try{ localStorage.setItem(KEY, toJSON(pf)); }catch(e){} }
export function load(){ try{ const s=localStorage.getItem(KEY); return s?fromJSON(s):newPortfolio(); }catch(e){ return newPortfolio(); } }
