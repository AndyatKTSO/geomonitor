# Geo-Monitor Solothurn

Statisches Test-Dashboard für GitHub Pages. Alle Themen und Kennzahlen beziehen sich auf den Kanton Solothurn. Das Umfeld der amtlichen Kantonsgrenze wird maskiert, einschliesslich der getrennten Kantonsteile. Keine erfundenen Messwerte oder Baustellenpunkte.

## In GitHub veröffentlichen

1. Neues Repository erstellen, zum Beispiel **GeoMonitorSolothurn**. Für GitHub Free ein öffentliches Repository verwenden.
2. ZIP entpacken. **Den Inhalt des Ordners `geo-monitor-solothurn` direkt ins Repository übernehmen**, nicht den übergeordneten Ordner. `index.html` muss im Hauptverzeichnis stehen.
3. Auch **`.github/workflows/pages.yml`** übernehmen. Falls der Windows-Explorer den Ordner ausblendet: versteckte Elemente anzeigen. Beim Browser-Upload prüfen, ob `.github` mit hochgeladen wurde. Fehlenden Workflow über **Add file → Create new file** unter genau diesem Pfad anlegen und den Inhalt der mitgelieferten Datei kopieren.
4. Standardbranch muss **main** heissen. Andernfalls den Branchnamen in `pages.yml` anpassen.
5. **Settings → Pages → Build and deployment → Source: GitHub Actions** wählen.
6. Unter **Actions → Geo-Monitor aktualisieren und publizieren → Run workflow** einmal starten. Wenn Actions deaktiviert ist, für das Repository aktivieren.
7. Nach erfolgreichem Lauf die URL unter **Settings → Pages** öffnen. Typisch: `https://DEIN-NAME.github.io/GeoMonitorSolothurn/`.

Die Dateien enthalten bereits echte Messdaten und die verwendete Baustellenliste aus dem Erstellungszeitpunkt. Bei jedem Datenlauf werden die Quellen neu bezogen. Wenn der automatische Datenlauf nicht eingerichtet ist, altern die mitgelieferten Daten; die Oberfläche kennzeichnet das.

## Inhalte

- Helle oder farbige amtliche Hintergrundkarte des Kantons.
- Amtliche Kantonsgrenze als GeoJSON; Umgebung maskiert.
- Wetterstationen Grenchen und Gösgen mit Temperatur, Niederschlag der letzten 10 Minuten und Windmittel.
- Niederschlagsstationen Nesselboden und Riedholz / Wallierhof, getrennt als blaue Messpunkte mit Niederschlagsverlauf.
- Verfügbare Temperaturzeitreihe mit offenen Datenlücken, höchstens 144 Messzeitpunkte.
- Zuschaltbare Verkehrszählstellen (MIV), Gefahrenkarte Wasser, Klimaanalyse Tag 2020, Grundwasser-Mittelstand und Gemeindegrenzen.
- Amtliche Legenden und Original-Links zu jeder Kartenebene.
- Baustellenliste mit Suche und Terminfilter; Original-PDF verlinkt und beigefügt.
- Quellenangaben, Publikations- und Messzeiten, Kennzeichnung alter Werte.

## Aktualisierung

GitHub Actions ist für Minute 17 und 47 jeder Stunde geplant. Geplante Läufe können verzögert werden oder ausfallen; es gibt keine garantierte 30-Minuten-Aktualität. Bei öffentlichen Repositories deaktiviert GitHub geplante Workflows nach längerer Inaktivität (derzeit 60 Tage); gegebenenfalls unter Actions wieder aktivieren.

Der Workflow publiziert direkt einen Pages-Build und schreibt keine Messdaten-Commits ins Repository. Deshalb zeigen die JSON-Dateien im Repository weiterhin den mitgelieferten Stand; die veröffentlichte Seite erhält die neu bezogenen Daten. Der Browser lädt die Wetter-JSON alle fünf Minuten erneut. Bei fehlgeschlagenem Abruf bleiben im jeweiligen Build die vorhandenen Daten erhalten und ein Fehlerstatus wird angezeigt; ein unvollständiger Baustellenimport ersetzt die bisherige Liste nicht.

## Datenqualität und Grenzen

**Amtliche Quelle bedeutet nicht automatisch abschliessend validierte Daten.** Das Dashboard ist ein Testprojekt, keine amtliche Auskunft oder Warnplattform.

### Wetter

Quelle: MeteoSchweiz Open Government Data, automatische Wetterstationen und automatische Niederschlagsstationen (`ogd-smn-precip`). Die Auswahl erfolgt aus den offiziellen Stationsmetadaten mit `station_canton=SO`; jeder Standort wird zusätzlich gegen das Polygon des Kantons geprüft. Neue Solothurner Stationen können damit automatisch hinzukommen. Ausserkantonale Stationen werden nicht einbezogen.

- CSV-Zeitstempel sind UTC; Anzeige in `Europe/Zurich`, inklusive Sommerzeit.
- `tre200s0`: Lufttemperatur 2 m, °C.
- `rre150z0`: Niederschlag der letzten 10 Minuten, mm; keine Tages- oder 24-Stunden-Summe.
- `fkl010z0`: 10-Minuten-Windmittel, m/s; für Anzeige mit 3.6 nach km/h umgerechnet.
- Leere Zellen bleiben `null`; keine Interpolation oder Nullersetzung.
- Echtzeitwerte sind als vorläufig gekennzeichnet. Kein Nachweis einer abschliessenden manuellen Prüfung.
- Älter als 45 Minuten: verzögert. Älter als 90 Minuten: veraltet. Diese Anzeigegrenzen sind Entscheidungen des Dashboards, keine offiziellen Qualitätsklassen.
- Die verfügbare CSV kann weniger als 24 Stunden enthalten. Die tatsächliche Zeitspanne wird angezeigt.

### Baustellen

Quelle: Amt für Verkehr und Tiefbau, PDF **Verkehrsbeschränkungen infolge Baustellen**.

- Publikationsdatum wird aus dem PDF extrahiert, Abrufdatum separat gespeichert.
- Spaltenzahl, Pflichtfelder und Termine werden geprüft. Bei unbekanntem Tabellenlayout wird der Import abgebrochen.
- Der Status «Laut Termin laufend» entsteht durch Datumsauswertung, nicht durch eine Live-Bestätigung der Baustelle.
- Die Liste ist nicht als vollständig für Gemeinde- und Nationalstrassen nachgewiesen.
- PDF enthält keine verlässlichen Koordinaten. Deshalb keine Baustellenpunkte auf der Karte.
- Textangaben werden übernommen, auch wenn die Quelle einen Orts- oder Strassentext abkürzt. SHA-256 und das verwendete PDF erlauben einen Abgleich.
- Älter als 14 Tage: Hinweis auf den alten Publikationsstand. Eine fachliche Kontrolle aller extrahierten Zeilen ersetzt die automatische Prüfung nicht.

### Kartenebenen

Die Layernamen wurden anhand der amtlichen WMS-GetCapabilities geprüft. Themenbilder und Legenden werden direkt vom Kanton geladen.

- Verkehrszählstellen: **Standorte**, keine Live-Messwerte oder Verkehrsmengen.
- Gefahrenkarte Wasser: **Gefährdung**, keine aktuelle Warnlage.
- Klimaanalyse Tag: **Modell 2020, 14 Uhr**, keine heutige Messung.
- Grundwasser-Mittelstand: **Kartengrundlage**, kein aktueller Pegel.
- Ein fachlicher Aktualisierungsstand ist nicht für jede Ebene maschinenlesbar nachgewiesen; entsprechend steht kein erfundenes Aktualisierungsdatum in der Oberfläche.
- Je Thema werden die Originallegende und das kantonale Geoportal verlinkt. Objektinformationen lassen sich bei aktiver Ebene per Kartenklick abrufen, soweit der Dienst und Browserzugriff dies erlauben.
- Die Darstellung berücksichtigt die Attribution. Für eine dauerhafte oder amtliche Veröffentlichung sind die Nutzungsbedingungen der konkreten Datensätze und die fachliche Freigabe zu prüfen.

## Quellen

- Kantonaler WMS: https://geo.so.ch/api/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0
- Kantonsgrenze (WFS 1.1, GeoJSON): siehe `BOUNDARY` in `scripts/update_data.py`.
- Geoportal: https://geo.so.ch/map/
- Datenbezug: https://data.geo.so.ch/
- AVT: https://so.ch/verwaltung/bau-und-justizdepartement/amt-fuer-verkehr-und-tiefbau/
- MeteoSchweiz-Dokumentation: https://opendatadocs.meteoswiss.ch/a-data-groundbased/a1-automatic-weather-stations
- CSV-Felder, UTC und Einheiten: https://opendatadocs.meteoswiss.ch/general/download

## Lokal testen

Python 3.12 oder neuer:

```bash
pip install -r requirements.txt
python scripts/update_data.py
python -m http.server 8000
```

Dann `http://localhost:8000` öffnen. `index.html` per Doppelklick verwendet `file://`; JSON-Abrufe funktionieren dort in vielen Browsern nicht.

Leaflet 1.9.4 ist lokal beigefügt, Lizenz in `vendor/LICENSE-Leaflet.txt`. Keine Nutzerkonten, API-Schlüssel oder Serverdatenbank erforderlich. Externe Abrufe erfolgen für amtliche Karten, Legenden, Objektinformationen und durch den Workflow für die Datenquellen.

## Aktualisierung dieser Version
Im bestehenden Repository `index.html`, `app.js`, `style.css`, `scripts/update_data.py` und `data/weather.json` ersetzen. Anschliessend den vorhandenen Pages-Workflow einmal manuell starten. Niederschlagsstationen liefern keine Temperatur- oder Windwerte. Weitere kantonale Boden- und Gewässermessnetze sind noch nicht angebunden.

## Zusätzliche Themen

- E-Auto-Ladepunkte: BFE / DIEMO, Betreiberangaben. Geografischer Filter gegen amtliche Solothurner Kantonsgrenze, Eindeutigkeit anhand EVSE-ID. Identische Koordinaten werden auf der Karte zusammengefasst. Ladepunkte sind nicht gleich Ladestandorte. Anschlüsse und maximale gemeldete Leistung sind sichtbar. Keine aktuelle Belegung; keine Vollständigkeitsgarantie.
- Radarstandorte: amtliche HTML-Tabellen der Kantonspolizei. Stationär und semistationär getrennt, Publikationsstand und Abrufdatum sichtbar. Keine mobile Kontrollen, keine exakten Kartenpunkte, keine Zuordnung einer Rotlichtfunktion ohne Beleg. Bei verändertem Quellformat bleibt die bisherige Datei erhalten; der Datenlauf meldet einen Fehler.
- Wanderwege: amtlicher WMS `ch.so.arp.wanderwege_mit_sperrungen_umleitungen`, mit Originallegende, Objektabfrage und Geoportal-Link. Der Kartenstand ist keine Garantie sofortiger Aktualisierung.

Für dieses Update alle Dateien inklusive des neuen Skripts `scripts/extra_data.py`, `data/charging.json` und `data/radar.json` übernehmen. Den vorhandenen Workflow danach einmal starten. Öffentliche Toiletten sind noch nicht enthalten.
