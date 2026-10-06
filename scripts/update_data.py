"""Amtliche Quellen beziehen, validieren und atomar als JSON bereitstellen."""
import csv
import io
import json
import math
import re
import sys
import time
import hashlib
import urllib.request
from pathlib import Path
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor
import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
UTC = timezone.utc
PDF = 'https://so.ch/fileadmin/internet/bjd/bjd-avt/pdf/Ausschreibungen_Planauflagen/Verkehrsbeschraenkung.pdf'
META = 'https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/ogd-smn_meta_stations.csv'
BOUNDARY = 'https://geo.so.ch/api/wfs?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=ch.so.agi.kantonsgrenzen&OUTPUTFORMAT=GeoJSON&SRSNAME=EPSG:4326'

def fetch(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'GeoMonitor-Solothurn/1.0'}), timeout=40) as r:
                return r.read()
        except Exception:
            if attempt == 2: raise
            time.sleep(1 + attempt * 2)

def save(name, value):
    p = DATA / name
    tmp = p.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    tmp.replace(p)

def inside_ring(lon, lat, ring):
    inside = False
    for a, b in zip(ring, ring[1:] + ring[:1]):
        if (a[1] > lat) != (b[1] > lat) and lon < (b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0]:
            inside = not inside
    return inside

def in_canton(lon, lat, boundary):
    return any(inside_ring(lon, lat, poly[0]) and not any(inside_ring(lon,lat,hole) for hole in poly[1:])
               for f in boundary['features'] for poly in f['geometry']['coordinates'])

def number(value):
    if value is None or not value.strip(): return None
    v = float(value)
    if not math.isfinite(v): raise ValueError('Ungültiger Zahlenwert')
    return v

def weather_station(row, boundary, dataset="smn"):
    code = row['station_abbr'].lower()
    lon = float(row['station_coordinates_wgs84_lon'])
    lat = float(row['station_coordinates_wgs84_lat'])
    if not in_canton(lon, lat, boundary): raise ValueError('Station ausserhalb Kantonsgrenze: '+code)
    url = f'https://data.geo.admin.ch/ch.meteoschweiz.ogd-{dataset}/{code}/ogd-{dataset}_{code}_t_now.csv'
    rows = list(csv.DictReader(io.StringIO(fetch(url).decode('cp1252')), delimiter=';'))
    points = []
    for r in rows:
        if r['station_abbr'].lower() != code: raise ValueError('Stationskennung stimmt nicht')
        t = datetime.strptime(r['reference_timestamp'], '%d.%m.%Y %H:%M').replace(tzinfo=UTC)
        points.append({'time':t.isoformat(), 'temperature':number(r.get('tre200s0')),
                       'rain':number(r.get('rre150z0')), 'wind':number(r.get('fkl010z0')),
                       'direction':number(r.get('dkl010z0'))})
    unique = {p['time']:p for p in points}
    points = sorted(unique.values(), key=lambda p:p['time'])
    if not points: raise ValueError('Leere Wetterdatei')
    # Keine Interpolation, keine Ersetzung fehlender Werte durch Null.
    return {'code':code.upper(), 'name':row['station_name'], 'lat':lat, 'lon':lon,
            'height':float(row['station_height_masl']), 'source':url,
            'kind':'precipitation' if dataset == 'smn-precip' else 'weather',
            'provider':'MeteoSchweiz',
            'fetched_at':datetime.now(UTC).isoformat(), 'latest':points[-1], 'series':points}

def weather(boundary):
    stations = []
    for dataset in ['smn', 'smn-precip']:
        meta = f'https://data.geo.admin.ch/ch.meteoschweiz.ogd-{dataset}/ogd-{dataset}_meta_stations.csv'
        rows = list(csv.DictReader(io.StringIO(fetch(meta).decode('cp1252')), delimiter=';'))
        stations.extend((r, dataset) for r in rows if r['station_canton'] == 'SO')
    if not stations: raise ValueError('Keine Solothurner Stationen in Metadaten')
    previous = json.loads((DATA/'weather.json').read_text()) if (DATA/'weather.json').exists() else {'stations':[]}
    result = []
    errors = []
    for row, dataset in stations:
        try: result.append(weather_station(row, boundary, dataset))
        except Exception as e:
            errors.append(row['station_abbr']+': '+str(e))
            old = next((s for s in previous['stations'] if s['code']==row['station_abbr']), None)
            if old:
                old['error'] = 'Letzter Abruf fehlgeschlagen; gespeicherte Werte'
                result.append(old)
    save('weather.json', {'checked_at':datetime.now(UTC).isoformat(), 'stations':result,
                         'errors':errors, 'source':META, 'scope':'station_canton=SO und Punkt innerhalb amtlicher Kantonsgrenze',
                         'quality':'Vorläufige Echtzeitmesswerte; keine abschliessende fachliche Validierung zugesichert.'})
    if errors: raise ValueError('; '.join(errors))

def construction():
    raw = fetch(PDF)
    with pdfplumber.open(io.BytesIO(raw)) as doc:
        text = '\n'.join(p.extract_text() or '' for p in doc.pages)
        tables = [t for p in doc.pages for t in p.extract_tables()]
    dated = re.search(r'(\d{2}\.\d{2}\.\d{4})\s+Seite', text)
    if not dated: raise ValueError('Publikationsdatum der Baustellenliste fehlt')
    records = []
    for table in tables:
        if not table or not table[0] or table[0][0] != 'Gemeinde': continue
        for row in table[1:]:
            if len(row)!=8: raise ValueError('Baustellentabelle hat unerwartete Spalten')
            clean = [re.sub(r'\s+', ' ', x or '').strip() for x in row]
            if not all(clean[i] for i in [0,1,4,5]): raise ValueError('Pflichtfeld fehlt')
            start = datetime.strptime(clean[4], '%d.%m.%Y').date()
            end = datetime.strptime(clean[5], '%d.%m.%Y').date()
            if end < start: raise ValueError('Ungültiger Baustellenzeitraum')
            records.append({'municipality':clean[0], 'street':clean[1], 'section_from':clean[2],
                            'section_to':clean[3], 'start':start.isoformat(), 'end':end.isoformat()})
    if not records: raise ValueError('Keine Baustellen erkannt; bisherige Datei bleibt erhalten')
    save('construction.json', {'source':PDF, 'source_date':datetime.strptime(dated[1],'%d.%m.%Y').date().isoformat(),
                              'fetched_at':datetime.now(UTC).isoformat(), 'sha256':hashlib.sha256(raw).hexdigest(),
                              'records':records, 'scope':'Vom AVT publizierte Verkehrsbeschränkungen infolge Baustellen; keine Vollständigkeit für alle Gemeinde- und Nationalstrassen zugesichert.'})
    (DATA/'baustellen-original.pdf').write_bytes(raw)

def main():
    DATA.mkdir(exist_ok=True)
    errors = []
    try:
        boundary = json.loads(fetch(BOUNDARY))
        boundary['features'] = [f for f in boundary['features'] if f['properties'].get('kantonskuerzel')=='SO']
        if len(boundary['features']) != 1: raise ValueError('Kantonsgrenze ungültig')
        save('canton.geojson', boundary)
    except Exception as e:
        errors.append('Kantonsgrenze: '+str(e))
        if not (DATA/'canton.geojson').exists(): raise
        boundary = json.loads((DATA/'canton.geojson').read_text())
    from extra_data import charging, radar
    with ThreadPoolExecutor(max_workers=4) as pool:
        tasks = [('Wetter',pool.submit(weather,boundary)),('Baustellen',pool.submit(construction)),('Ladestationen',pool.submit(charging,boundary)),('Radar',pool.submit(radar))]
        for label,task in tasks:
            try: task.result()
            except Exception as e: errors.append(label+': '+str(e))
    save('status.json', {'checked_at':datetime.now(UTC).isoformat(), 'errors':errors})
    for e in errors: print(e, file=sys.stderr)
    print('Quellen aktualisiert; Fehler:',len(errors))
    # Status wird auch bei Fehlern publiziert; vorhandene Daten bleiben erkennbar erhalten.

if __name__=='__main__': main()
