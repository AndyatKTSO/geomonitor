'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = (s, time=false) => s ? new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',day:'2-digit',month:'2-digit',year:'numeric',...(time?{hour:'2-digit',minute:'2-digit'}:{})}).format(new Date(s.length===10?s+'T12:00:00Z':s)) : 'nicht ausgewiesen';
const value = (v, unit) => v===null||v===undefined ? '—' : new Intl.NumberFormat('de-CH',{maximumFractionDigits:1}).format(v)+' '+unit;
const WMS = 'https://geo.so.ch/api/wms';
const themes = [
  {id:'weather',title:'Wetterstationen',sub:'Messwerte · Grenchen & Gösgen',checked:true},
  {id:'ch.so.avt.verkehrszaehlstellen.zaehlstellen.miv',title:'Verkehrszählstellen',sub:'Standorte MIV · keine Live-Werte',note:'Amtliche Standorte der Verkehrszählstellen für motorisierten Individualverkehr. Keine aktuellen Verkehrsflüsse. Fachlicher Datenstand: siehe Geoportal.'},
  {id:'ch.so.afu.naturgefahren.gefahrengebiet_wasser',title:'Naturgefahren · Wasser',sub:'Gefahrenkarte · keine Live-Warnung',note:'Gefährdungsgrundlage für Wassergefahren. Keine Aussage zur aktuellen Hochwasserlage. Fachlicher Datenstand: siehe Geoportal.'},
  {id:'ch.so.afu.klimaanalysekarte.luftemperatur_14uhr_ist',title:'Klima · Hitze am Tag',sub:'Modell · Lufttemperatur 14 Uhr · 2020',note:'Modellierte Lufttemperatur am Tag (14 Uhr), Ist-Zustand 2020. Keine heutige Temperaturmessung.'},
  {id:'ch.so.afu.grundwasser.mittelstand',title:'Grundwasser',sub:'Kartengrundlage · Mittelstand',note:'Amtliche Grundwassergeometrie zum Mittelstand. Kein aktueller Grundwasserpegel. Fachlicher Datenstand: siehe Geoportal.'},
  {id:'ch.so.agi.gemeindegrenzen',title:'Gemeindegrenzen',sub:'Amtliche räumliche Gliederung',note:'Gemeindegrenzen des Kantons Solothurn aus dem kantonalen Kartendienst.'}
];
let map, base, boundary, stationGroup, weatherData, roadData, selectedCode, selectedMetric='temperature';
const layers = new Map();
const active = new Set();
const problems = new Set();
function problem(text){problems.add(text);$('globalError').classList.remove('hidden');$('globalError').textContent=Array.from(problems).join(' · ');}
function message(text){$('mapMessage').textContent=text;}
async function load(path){const r=await fetch(path+'?v='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error(path+': HTTP '+r.status);return r.json();}
function ringContains(lon,lat,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>lat)!==(b[1]>lat)&&lon<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function inside(p){return boundary.features.some(f=>f.geometry.coordinates.some(poly=>ringContains(p.lng,p.lat,poly[0])&&!poly.slice(1).some(h=>ringContains(p.lng,p.lat,h))));}
function wms(layer,opacity=1,pane='tilePane'){
  const l=L.tileLayer.wms(WMS,{layers:layer,format:'image/png',transparent:true,version:'1.1.1',opacity,pane,maxZoom:19,attribution:'© Kanton Solothurn'});
  l.on('tileerror',()=>message('Kartendienst teilweise nicht erreichbar. Thema: '+(themes.find(t=>t.id===layer)?.title || 'Grundkarte')));
  return l;
}
function initMap(){
  if(!window.L){problem('Kartenbibliothek konnte nicht geladen werden.');return;}
  map=L.map('map',{zoomControl:false,minZoom:9,maxZoom:19,maxBounds:[[46.96,7.18],[47.63,8.18]],maxBoundsViscosity:.8});
  L.control.zoom({position:'topright'}).addTo(map);
  base=wms($('basemap').value).addTo(map);
  map.createPane('mask');map.getPane('mask').style.zIndex=450;map.getPane('mask').style.pointerEvents='none';
  map.createPane('outline');map.getPane('outline').style.zIndex=455;map.getPane('outline').style.pointerEvents='none';
  stationGroup=L.layerGroup().addTo(map);
  const geo=L.geoJSON(boundary,{pane:'outline',style:{color:'#137d72',weight:2.4,opacity:.9,fill:false},interactive:false}).addTo(map);
  // Die Aussenseite wird mit den amtlichen Polygonen als Löcher maskiert.
  const rings=[[[46.3,6.6],[48.2,6.6],[48.2,8.8],[46.3,8.8]]];
  for(const f of boundary.features)for(const poly of f.geometry.coordinates){rings.push(poly[0].map(p=>[p[1],p[0]]));for(const hole of poly.slice(1))L.polygon(hole.map(p=>[p[1],p[0]]),{pane:'mask',stroke:false,fillColor:'#f0f4f1',fillOpacity:1,interactive:false}).addTo(map);}
  L.polygon(rings,{pane:'mask',stroke:false,fillColor:'#f0f4f1',fillOpacity:1,fillRule:'evenodd',interactive:false}).addTo(map);
  const reset=()=>map.fitBounds(geo.getBounds(),{padding:[25,25]});reset();
  $('resetMap').addEventListener('click',reset);
  $('basemap').addEventListener('change',()=>{map.removeLayer(base);base=wms($('basemap').value).addTo(map);message('Amtliche Grundkarte · nur Kanton Solothurn');});
  $('layerControls').innerHTML=themes.map(t=>`<label class="layer-option"><input type="checkbox" data-layer="${esc(t.id)}" ${t.checked?'checked':''}><span><strong>${esc(t.title)}</strong><small>${esc(t.sub)}</small></span></label>`).join('');
  $('layerControls').addEventListener('change',e=>{
    const id=e.target.dataset.layer;if(!id)return;
    if(id==='weather'){e.target.checked?stationGroup.addTo(map):map.removeLayer(stationGroup);return;}
    if(e.target.checked){let l=layers.get(id);if(!l){l=wms(id,id.includes('klimaanalyse')?.65:.8);layers.set(id,l);}l.addTo(map);active.add(id);message(themes.find(t=>t.id===id).note);}
    else{map.removeLayer(layers.get(id));active.delete(id);message('Amtliche Kartengrundlagen · keine aktuelle Warnlage');}legends();
  });
  map.on('click',queryFeature);
  message('Amtliche Grundkarte · nur Kanton Solothurn');
}
function legends(){
  $('legendPanel').classList.toggle('hidden',!active.size);
  $('legendPanel').innerHTML=Array.from(active).map(id=>{const t=themes.find(x=>x.id===id);const u='https://geo.so.ch/api/v1/legend/somap?'+new URLSearchParams({SERVICE:'WMS',VERSION:'1.3.0',REQUEST:'GetLegendGraphic',LAYER:id,FORMAT:'image/png',STYLE:'default',SLD_VERSION:'1.1.0'});return `<article class="legend-item"><strong>${esc(t.title)}</strong><img src="${esc(u)}" alt="Amtliche Legende: ${esc(t.title)}"><p>${esc(t.note)}</p><a href="https://geo.so.ch/map/?l=${encodeURIComponent(id)}" target="_blank" rel="noopener">Ebene im Geoportal ↗</a></article>`;}).join('');
  $('legendPanel').querySelectorAll('img').forEach(i=>i.addEventListener('error',()=>{i.alt='Legende derzeit nicht verfügbar – bitte Geoportal öffnen';}));
}
async function queryFeature(e){
  if(!active.size||!inside(e.latlng))return;
  const id=Array.from(active).at(-1),t=themes.find(x=>x.id===id),b=map.getBounds(),sw=map.options.crs.project(b.getSouthWest()),ne=map.options.crs.project(b.getNorthEast()),s=map.getSize(),p=map.latLngToContainerPoint(e.latlng);
  const params=new URLSearchParams({SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetFeatureInfo',LAYERS:id,QUERY_LAYERS:id,STYLES:'',SRS:'EPSG:3857',BBOX:[sw.x,sw.y,ne.x,ne.y].join(','),WIDTH:s.x,HEIGHT:s.y,X:Math.round(p.x),Y:Math.round(p.y),INFO_FORMAT:'text/plain',FEATURE_COUNT:3});
  const box=document.createElement('div');box.innerHTML=`<strong>${esc(t.title)}</strong><p>${esc(t.note)}</p><a href="https://geo.so.ch/map/?l=${encodeURIComponent(id)}" target="_blank" rel="noopener">Amtliches Geoportal ↗</a><pre class="layer-detail">Objektinformation wird geladen …</pre>`;
  L.popup().setLatLng(e.latlng).setContent(box).openOn(map);
  try{const r=await fetch(WMS+'?'+params,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const text=await r.text();box.querySelector('pre').textContent=text.includes('ServiceException')?'Objektabfrage nicht verfügbar. Bitte Geoportal öffnen.':text.trim().slice(0,2200)||'Keine Objektinformation an dieser Stelle.';}catch{box.querySelector('pre').textContent='Objektabfrage nicht erreichbar. Bitte Geoportal öffnen.';}
}
function freshness(s){const age=(Date.now()-new Date(s.latest.time))/60000;return {label:s.error?'Abruf fehlgeschlagen':age>90?'Messwert veraltet':age>45?'Messwert verzögert':'Letzte Messung',cls:s.error||age>90?'error':age>45?'warning':''};}
function drawWeather(){
  stationGroup.clearLayers();
  $('stationCount').textContent=weatherData.stations.length;
  for(const s of weatherData.stations){
    if(!inside({lat:s.lat,lng:s.lon})){problem('Station ausserhalb Kantonsgrenze verworfen: '+s.name);continue;}
    const fresh=freshness(s),temp=value(s.latest.temperature,'°');
    L.marker([s.lat,s.lon],{icon:L.divIcon({className:'',html:`<div class="weather-pin ${fresh.cls?'stale':''}" style="width:40px;height:40px">${esc(temp)}</div>`,iconSize:[40,40],iconAnchor:[20,20]}),title:s.name+' – '+temp,keyboard:true}).bindTooltip(esc(s.name),{permanent:true,direction:'bottom',offset:[0,18],className:'weather-label'}).on('click',()=>selectStation(s.code)).addTo(stationGroup);
    if($('temp'+s.code)){$('temp'+s.code).textContent=value(s.latest.temperature,'°C');$('time'+s.code).textContent=date(s.latest.time,true)+(fresh.cls?' · '+fresh.label:'');}
  }
  if(weatherData.errors?.length)problem('Wetterabruf unvollständig. Verfügbare gespeicherte Werte sind gekennzeichnet.');
  if(weatherData.stations.length)selectStation(selectedCode||weatherData.stations.find(s=>s.code==='GRE')?.code||weatherData.stations[0].code);
}
function selectStation(code){
  selectedCode=code;const s=weatherData.stations.find(s=>s.code===code);if(!s)return;const f=freshness(s);
  $('stationDetail').innerHTML=`<h2>${esc(s.name)}</h2><p class="station-height">${esc(s.height)} m ü. M. · MeteoSchweiz</p><span class="station-status ${f.cls}">${esc(f.label)}</span><div class="station-values"><div class="wide"><span>Lufttemperatur · 2 m über Boden</span><strong>${value(s.latest.temperature,'°C')}</strong></div><div><span>Niederschlag · letzte 10 Min.</span><strong>${value(s.latest.rain,'mm')}</strong></div><div><span>Wind · 10-Minuten-Mittel</span><strong>${value(s.latest.wind===null?null:s.latest.wind*3.6,'km/h')}</strong></div></div><p class="station-meta">Messzeit: ${date(s.latest.time,true)}<br>Abruf: ${date(s.fetched_at,true)}</p><a href="${esc(s.source)}" target="_blank" rel="noopener">Originaldaten CSV ↗</a>`;
  chart(s.series);
}
function chart(series){
  const samples=series.slice(-144),points=samples.filter(x=>x.temperature!==null),svg=$('chart');
  if(!points.length){svg.innerHTML='<text x="10" y="70" fill="#637b7b" font-size="12">Keine Temperaturwerte verfügbar</text>';return;}
  const lo=Math.floor(Math.min(...points.map(p=>p.temperature))-1),hi=Math.ceil(Math.max(...points.map(p=>p.temperature))+1),t0=Date.parse(samples[0].time),t1=Date.parse(samples.at(-1).time);
  const x=p=>35+(Date.parse(p.time)-t0)/Math.max(t1-t0,1)*285,y=p=>110-(p.temperature-lo)/(hi-lo)*95;
  let path='',prev=null;
  for(const p of samples){if(p.temperature===null){prev=null;continue;}const gap=!prev||Date.parse(p.time)-Date.parse(prev.time)>15*60000;path+=(gap?'M':'L')+x(p).toFixed(1)+','+y(p).toFixed(1)+' ';prev=p;}
  const hour=s=>new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit'}).format(new Date(s));
  svg.innerHTML=[lo,(lo+hi)/2,hi].map(v=>`<line x1="35" y1="${y({temperature:v})}" x2="320" y2="${y({temperature:v})}" stroke="#e0e9e4"/><text x="0" y="${y({temperature:v})+4}" fill="#71877d" font-size="10">${v.toFixed(0)}°</text>`).join('')+`<path d="${path}" fill="none" stroke="#187e74" stroke-width="2.4"/><text x="35" y="135" fill="#71877d" font-size="10">${hour(samples[0].time)}</text><text x="320" y="135" text-anchor="end" fill="#71877d" font-size="10">${hour(samples.at(-1).time)}</text>`;
  $('chartRange').textContent=date(samples[0].time,true)+' – '+date(samples.at(-1).time,true)+' · Lücken bleiben offen';
}
function today(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=t=>parts.find(p=>p.type===t).value;return get('year')+'-'+get('month')+'-'+get('day');}
function roadState(r){return today()<r.start?'planned':today()>r.end?'ended':'active';}
function roads(){
  const activeCount=roadData.records.filter(r=>roadState(r)==='active').length;
  $('roadCount').textContent=activeCount;$('roadDate').textContent='AVT · Liste vom '+date(roadData.source_date);
  $('roadSource').href=roadData.source;
  const days=Math.floor((Date.now()-Date.parse(roadData.source_date+'T00:00:00Z'))/86400000);
  $('roadFootnote').textContent='Publikationsdatum: '+date(roadData.source_date)+' · Abruf: '+date(roadData.fetched_at,true)+'. '+roadData.scope+' Keine geschätzten Kartenpunkte; Textangaben entsprechen der Quelle.';
  if(days>14)problem('Baustellenliste älter als 14 Tage. Terminstatus kann von der tatsächlichen Lage abweichen.');
  renderRoads();
}
function renderRoads(){
  const q=$('roadSearch').value.toLocaleLowerCase('de-CH'),status=$('roadStatus').value;
  const rows=roadData.records.filter(r=>(status==='all'||roadState(r)===status)&&[r.municipality,r.street,r.section_from,r.section_to].join(' ').toLocaleLowerCase('de-CH').includes(q));
  const labels={active:'Laut Termin laufend',planned:'Geplant',ended:'Termin abgelaufen'};
  $('roadRows').innerHTML=rows.map(r=>`<tr><td><strong>${esc(r.municipality)}</strong></td><td><strong>${esc(r.street)}</strong><small>${esc(r.section_from)}${r.section_to?' → '+esc(r.section_to):''}</small></td><td>${date(r.start)}<br><small>bis ${date(r.end)}</small></td><td><span class="road-tag ${roadState(r)}">${labels[roadState(r)]}</span></td></tr>`).join('')||'<tr><td colspan="4" class="empty">Keine Einträge für diese Auswahl.</td></tr>';
  $('roadSummary').textContent=rows.length+' von '+roadData.records.length+' publizierten Einträgen';
}
async function start(){
  $('roadSearch').addEventListener('input',()=>roadData&&renderRoads());$('roadStatus').addEventListener('change',()=>roadData&&renderRoads());
  try{boundary=await load('data/canton.geojson');initMap();}catch{problem('Kantonskarte konnte nicht geladen werden. Bitte die Seite über GitHub Pages oder einen lokalen Webserver öffnen.');message('Karte nicht verfügbar');}
  await Promise.all([
    load('data/weather.json').then(d=>{weatherData=d;if(map)drawWeather();}).catch(()=>problem('Wetterdaten nicht verfügbar.')),
    load('data/construction.json').then(d=>{roadData=d;roads();}).catch(()=>problem('Baustellenliste nicht verfügbar.')),
    load('data/status.json').then(d=>{$('refreshTime').textContent='Letzter Datenlauf: '+date(d.checked_at,true);if(d.errors.length)problem('Einzelne Quellen konnten beim letzten Datenlauf nicht aktualisiert werden.');}).catch(()=>{$('refreshTime').textContent='Letzter Datenlauf nicht verfügbar';})
  ]);
}
start();
// Aktualisiert die sichtbaren Messwerte aus dem letzten veröffentlichten Datenlauf.
setInterval(async()=>{try{weatherData=await load('data/weather.json');if(map)drawWeather();}catch{}},5*60*1000);
