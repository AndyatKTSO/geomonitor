"""Zusätzliche amtliche Daten; nur Solothurn, keine geschätzten Koordinaten."""
import gzip
import json
import re
from html.parser import HTMLParser
from datetime import datetime, timezone
from update_data import fetch, save, in_canton
CHARGING='https://data.geo.admin.ch/ch.bfe.ladestellen-elektromobilitaet/data/ch.bfe.ladestellen-elektromobilitaet.json'
RADAR='https://so.ch/verwaltung/departement-des-innern/polizei/praevention/verkehr/radarstandorte/'

def charging(boundary, raw=None):
    raw=fetch(CHARGING) if raw is None else raw
    if raw[:2]==b'\x1f\x8b': raw=gzip.decompress(raw)
    data=json.loads(raw)
    if not isinstance(data.get('EVSEData'),list): raise ValueError('Unbekanntes Ladepunktformat')
    records={}
    for operator in data['EVSEData']:
        for r in operator['EVSEDataRecord']:
            try: lat,lon=map(float,r['GeoCoordinates']['Google'].split())
            except (KeyError,TypeError,ValueError): continue
            if not (7.2 <= lon <= 8.1 and 47.0 <= lat <= 47.6): continue
            if not in_canton(lon,lat,boundary): continue
            a=r.get('Address') or {}
            names=r.get('ChargingStationNames') or []
            name=next((x['value'] for x in names if x.get('lang')=='de'),a.get('Street') or 'Ladepunkt')
            records[r['EvseID']]={'id':r['EvseID'],'name':name,'lat':lat,'lon':lon,'city':a.get('City'),'street':a.get('Street'),'plugs':r.get('Plugs') or [],'power_kw':max((float(x['power']) for x in r.get('ChargingFacilities',[]) if x.get('power')),default=None),'open24':r.get('IsOpen24Hours'),'access':r.get('Accessibility')}
    if not records: raise ValueError('Keine Solothurner Ladepunkte erkannt')
    save('charging.json',{'source':CHARGING,'fetched_at':datetime.now(timezone.utc).isoformat(),'records':list(records.values()),'scope':'Vom BFE aggregierte Betreiberangaben; Ladepunkte innerhalb amtlicher Kantonsgrenze. Keine Vollständigkeitsgarantie. Keine aktuelle Belegung in diesem Dashboard.'})

class RadarParser(HTMLParser):
    def __init__(self):
        super().__init__();self.section=None;self.heading=False;self.head='';self.cell=None;self.row=[];self.records=[];self.text=[]
    def handle_starttag(self,tag,attrs):
        if tag=='h3':self.heading=True;self.head=''
        if tag=='tr':self.row=[]
        if tag in ('td','th'):self.cell=''
    def handle_data(self,d):
        self.text.append(d)
        if self.heading:self.head+=d
        if self.cell is not None:self.cell+=d
    def handle_endtag(self,tag):
        if tag=='h3':
            self.heading=False;self.section={'Semistationäre Anlagen':'semi','Stationäre Anlagen':'fixed'}.get(self.head.strip())
        if tag in ('td','th') and self.cell is not None:self.row.append(re.sub(r'\s+',' ',self.cell).strip());self.cell=None
        if tag=='tr' and self.section and len(self.row)==2 and self.row[0] and self.row[0]!='Gemeinde':self.records.append({'type':self.section,'municipality':self.row[0],'location':self.row[1]})

def radar(raw=None):
    p=RadarParser();p.feed((fetch(RADAR) if raw is None else raw).decode('utf-8'))
    text=' '.join(p.text);m=re.search(r'Stand:\s*(\d{1,2})\.\s*(\w+)\s*(\d{4})',text)
    if not p.records or not m or not any(r['type']=='fixed' for r in p.records):raise ValueError('Radarübersicht unvollständig oder Format geändert')
    save('radar.json',{'records':p.records,'source':RADAR,'source_date_text':m.group(0),'fetched_at':datetime.now(timezone.utc).isoformat(),'scope':'Publizierte stationäre und semistationäre Anlagen. Mobile Kontrollen fehlen. Kurzfristige Änderungen möglich. Rotlichtfunktion ist nicht je Standort ausgewiesen.'})
