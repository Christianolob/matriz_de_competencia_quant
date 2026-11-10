import { readFileSync, writeFileSync } from "fs";
import { skills as baseSkills } from "./data/skills.js";
import { applyLayout } from "./data/layout.js";
import { overrides, addedNodes, deletedIds } from "./data/overrides.js";

const P0=[2777,2139];           // bp-10 Capital de Giro
const PC=[2828,1642];           // Credito (finance-5)
const C=[(P0[0]+PC[0])/2,(P0[1]+PC[1])/2];
const r=Math.hypot(P0[0]-C[0],P0[1]-C[1]);
let a0=Math.atan2(P0[1]-C[1],P0[0]-C[0]);
let a1=Math.atan2(PC[1]-C[1],PC[0]-C[0]);
// go the WEST way (through angle ~180°/pi): ensure increasing path passes west
if(a1<a0) a1+=2*Math.PI;
const ids=["custom-bp-11","custom-bp-12","custom-bp-13","custom-bp-14","custom-bp-15","custom-bp-16","custom-bp-17","custom-bp-18","custom-bp-19","custom-bp-20"];
const coords={};
ids.forEach((id,i)=>{ const a=a0+(a1-a0)*(i+1)/11; coords[id]=[Math.round(C[0]+r*Math.cos(a)),Math.round(C[1]+r*Math.sin(a))]; });

const base=baseSkills.map(s=>({...s})); applyLayout(base);
const deleted=new Set(deletedIds);
let ex=[...base,...addedNodes.map(s=>({...s}))].filter(s=>!deleted.has(s.id)&&!ids.includes(s.id));
ex=ex.map(s=>({...s,...(overrides[s.id]??{})}));
const pts=ids.map(id=>({id,x:coords[id][0],y:coords[id][1]}));
let min=1e9,info="";
for(const p of pts)for(const q of [...ex,...pts]){ if(p.id===q.id)continue; const d=Math.hypot(p.x-q.x,p.y-q.y); if(d<min){min=d;info=`${p.id} <-> ${q.id}(${Math.round(q.x)},${Math.round(q.y)})`;}}
console.log("apex west x:",Math.round(C[0]-r),"  min gap:",Math.round(min),info);
ids.forEach(id=>console.log(id, coords[id].join(',')));

let f=readFileSync("./data/overrides.js","utf8");
for(const id of ids){
  const [nx,ny]=coords[id];
  const re=new RegExp(`(id: "${id}",[\s\S]*?\n\s*x: )\d+(,\n\s*y: )\d+`);
  if(!re.test(f)) throw new Error("not found: "+id);
  f=f.replace(re,`$1${nx}$2${ny}`);
}
const removeLines=[
  '  { from: "custom-finance-2", to: "custom-bp-11" },',
  '  { from: "custom-bp-10", to: "custom-finance-5" },',
];
let lines=f.split("\n").filter(l=>!removeLines.includes(l));
const anchor='  { from: "custom-bp-19", to: "custom-bp-20" },';
const idx=lines.indexOf(anchor);
if(idx<0) throw new Error("anchor missing");
lines.splice(idx+1,0,
  '  { from: "custom-bp-10", to: "custom-bp-11" },',
  '  { from: "custom-bp-20", to: "custom-finance-5" },');
writeFileSync("./data/overrides.js",lines.join("\n"));
console.log("applied");
