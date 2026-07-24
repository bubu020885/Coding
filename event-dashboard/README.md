# Event Dashboard

Vollbild-Dashboard für einen dauerhaft angeschlossenen Bildschirm (Kiosk/TV). Zeigt
drei Spalten – **Heute**, **Morgen**, **Übermorgen** – mit allen Terminen aus einem
ICS-Kalender-Feed (Startzeit, Eventname, Ort, Teilnehmerzahl, Notizen). Aktualisiert
sich automatisch in Echtzeit.

## Architektur

- **Backend** (`server.js`, Node/Express): ruft den ICS-Feed serverseitig ab (nicht im
  Browser – dadurch keine CORS-/Mixed-Content-Probleme, auch weil der Feed nur über
  `http://` erreichbar ist), parst ihn mit `node-ical`, löst wiederkehrende Termine
  (RRULE) für den relevanten Zeitraum auf und cached das Ergebnis. Ein Intervall-Timer
  holt den Feed alle `REFRESH_INTERVAL_MS` (Standard: 60 s) neu. Die Route
  `GET /api/events` liefert die aufbereiteten Termine als JSON.
- **Frontend** (`public/`): statisches HTML/CSS/JS. Pollt `/api/events` alle
  `refreshIntervalMs` (vom Server vorgegeben), rendert die drei Spalten neu, zeigt eine
  Live-Uhr, einen Verbindungsstatus-Punkt und den Zeitpunkt der letzten Aktualisierung.
  Läuft die Anzeige über Mitternacht, lädt sich die Seite automatisch neu, damit
  Heute/Morgen/Übermorgen korrekt bleiben.

## Teilnehmerzahl & Notizen

Der Feed selbst kennt kein eigenes „Teilnehmerzahl“-Feld – die Info steckt (wenn
vorhanden) im `DESCRIPTION`-Text jedes Termins. Der Server sucht darin nach Mustern wie:

```
Teilnehmer: 12
TN: 45
Personen: 60
Pax: 8
Anmeldungen: 20
```

Die erkannte Zahl wird als Teilnehmerzahl angezeigt, der Rest des Beschreibungstexts
als Notiz. Wird kein Muster erkannt, erscheint der komplette Beschreibungstext als
Notiz (kein Datenverlust) und die Teilnehmerzahl bleibt leer.

**Falls euer Feed ein anderes Label verwendet** (z. B. „Buchungen“ oder ein
Zahlenformat wie „12/20 Plätze“), einfach das Regex in `server.js`
(`PARTICIPANTS_PATTERN`) anpassen – am besten anhand eines echten Beispiel-Termins aus
dem Feed.

> Hinweis: Der Feed war aus der Entwicklungsumgebung dieser Session heraus nicht
> erreichbar (Netzwerk-Policy blockt den Host). Getestet wurde die komplette Logik
> (Parsing, Zeitzonen, wiederkehrende Termine, Teilnehmer-Erkennung, Rendering) daher
> gegen einen lokalen Beispiel-Feed. Bitte nach dem ersten Start auf dem Zielsystem
> kurz prüfen, ob die echten Beschreibungstexte des Feeds vom Regex erkannt werden –
> siehe oben.

## Setup

```bash
cd event-dashboard
npm install
cp .env.example .env   # bei Bedarf Werte anpassen
npm start
```

Danach ist das Dashboard unter `http://localhost:3000` erreichbar.

### Konfiguration (`.env`)

| Variable              | Bedeutung                                      | Standard                        |
|-----------------------|--------------------------------------------------|----------------------------------|
| `PORT`                 | HTTP-Port des Dashboards                         | `3000`                           |
| `ICS_FEED_URL`         | URL des ICS-Feeds                                | (Koronaevent-Feed aus der Anfrage) |
| `REFRESH_INTERVAL_MS`  | Wie oft Server & Browser neu laden (Millisekunden)| `60000` (60 s)                   |
| `TIMEZONE`             | Zeitzone für Tagesgrenzen & Anzeige              | `Europe/Berlin`                  |

## Dauerhaft auf einem Bildschirm anzeigen

Das Dashboard ist als reine URL gedacht, die permanent in einem Browser im
Kiosk-/Vollbildmodus offen bleibt:

1. Server dauerhaft laufen lassen (z. B. per `pm2`, `systemd`-Service oder Docker) auf
   einem Rechner/Server im Netzwerk, den der Bildschirm erreichen kann.
2. Am Bildschirm-Client (Raspberry Pi, Mini-PC, Smart-TV-Browser, …) den Browser im
   Kiosk-Modus auf die Dashboard-URL zeigen lassen, z. B.:
   ```bash
   chromium --kiosk --noerrdialogs --disable-infobars http://<server>:3000
   ```
3. Für Chromium/Chrome empfiehlt sich zusätzlich eine Erweiterung wie „Kiosk“ oder ein
   Autostart-Skript, das den Browser nach einem Absturz/Neustart automatisch wieder
   öffnet.
4. Die Seite selbst muss nicht manuell neu geladen werden – sie pollt den Server
   selbstständig und lädt sich beim Tageswechsel automatisch neu.

## Produktivbetrieb

- `npm start` als Systemdienst betreiben (z. B. `pm2 start server.js --name event-dashboard`).
- Läuft der Feed-Abruf einmal ins Leere (Netzwerkfehler, Feed nicht erreichbar), bleibt
  der zuletzt bekannte Stand sichtbar; der Status-Punkt oben rechts wird rot und
  `error` in `/api/health` gesetzt, bis der nächste Abruf wieder klappt.
