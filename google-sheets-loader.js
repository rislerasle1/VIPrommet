const CACHE_MS = 30000;
let cache = null;
let cacheTime = 0;
function txt(v){ return v == null ? "" : String(v).trim(); }
function yes(v){ return ["ja","yes","true","1"].includes(txt(v).toLowerCase()); }
function esc(v){ return String(v ?? "").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function parseDate(v){ const s=txt(v); let m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if(m)return new Date(+m[1],+m[2]-1,+m[3]); m=s.match(/^(\d{1,2})[.\/]\s*(\d{1,2})[.\/]\s*(\d{4})$/); if(m)return new Date(+m[3],+m[2]-1,+m[1]); const d=new Date(s); return isNaN(d)?null:d; }
async function getCsv(url){
  if(!url || url.startsWith("LIM_INN_")) throw new Error("CSV-lenkene er ikke lagt inn i sheets-config.js.");
  const r=await fetch(url+(url.includes("?")?"&":"?")+"cb="+Date.now(),{cache:"no-store"});
  if(!r.ok) throw new Error("Kunne ikke hente publisert Google-ark.");
  const csv=await r.text();
  const raw=Papa.parse(csv,{header:false,skipEmptyLines:true});
  if(raw.errors.length) console.warn(raw.errors);
  const rows=raw.data;
  const known=["Aktiv","Kategoriplass","Tag","Dag","Nøkkel"];
  const headerIndex=rows.findIndex(row=>row.some(cell=>known.includes(txt(cell))));
  if(headerIndex<0) throw new Error("Fant ikke kolonneoverskriftene i et publisert ark.");
  const headers=rows[headerIndex].map(txt);
  return rows.slice(headerIndex+1).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]??""])));
}
async function loadKioskData(force=false){
  if(!force && cache && Date.now()-cacheTime<CACHE_MS) return cache;
  const u=window.VIPROMMET_SHEETS;
  const [menuRows,categoryRows,tagRows,hourRows,dutyRows,textRows]=await Promise.all([
    getCsv(u.meny),getCsv(u.kategorier),getCsv(u.tags),getCsv(u.apningstider),getCsv(u.kioskvakter),getCsv(u.tekster)
  ]);
  const settings={}; textRows.forEach(r=>settings[txt(r["Nøkkel"])]=txt(r["Verdi"]));
  const icons={}; tagRows.forEach(r=>icons[txt(r["Tag"])]=txt(r["Ikon"]));
  const categories=categoryRows.map(r=>({slot:Number(r["Kategoriplass"]),name:txt(r["Kategorinavn"]),active:r["Aktiv"]===undefined||yes(r["Aktiv"]),order:Number(r["Rekkefølge"])||Number(r["Kategoriplass"])||999})).filter(x=>x.slot&&x.name&&x.active).sort((a,b)=>a.order-b.order);
  const products=menuRows.filter(r=>yes(r["Aktiv"])&&txt(r["Produkt"])).map(r=>({slot:Number(r["Kategoriplass"]),name:txt(r["Produkt"]),price:Number(String(r["Pris"]).replace(',','.'))||0,description:txt(r["Beskrivelse"]),badge:txt(r["Tag"])==="Ingen"?"":txt(r["Tag"]),badgeIcon:icons[txt(r["Tag"])]||"",order:Number(r["Rekkefølge"])||999}));
  const menuCategories=categories.map(c=>({name:c.name,slot:c.slot,order:c.order,items:products.filter(p=>p.slot===c.slot).sort((a,b)=>a.order-b.order)})).filter(c=>c.items.length);
  const openingHours=hourRows.map(r=>({day:txt(r["Dag"]),open:txt(r["Åpner"]),close:txt(r["Stenger"])})).filter(x=>x.day);
  const dutyPeriods=dutyRows.filter(r=>yes(r["Aktiv"])).map(r=>({start:parseDate(r["Fra dato"]),end:parseDate(r["Til dato"]),team:txt(r["Lag"]),born:txt(r["Årskull"])})).filter(x=>x.start&&x.end&&x.team);
  cache={settings,menuCategories,openingHours,dutyPeriods}; cacheTime=Date.now(); return cache;
}
function paginateMenu(categories){
  const pages=[]; let page=[]; let productCount=0;
  function pushPage(){ if(page.length){pages.push(page);page=[];productCount=0;} }
  for(const category of categories){
    let remaining=[...category.items];
    while(remaining.length){
      if(page.length>=4 || productCount>=16) pushPage();
      const room=16-productCount;
      if(room<=0){pushPage();continue;}
      const take=Math.min(remaining.length,room);
      page.push({name:category.name,items:remaining.splice(0,take)});
      productCount+=take;
      if(page.length>=4 || productCount>=16) pushPage();
    }
  }
  pushPage(); return pages.length?pages:[[]];
}
