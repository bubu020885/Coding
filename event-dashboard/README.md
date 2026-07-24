# Event Dashboard

Vollbild-Dashboard für einen dauerhaft angeschlossenen Bildschirm (Kiosk/TV). Zeigt
drei Spalten – **Heute**, **Morgen**, **Übermorgen** – mit allen Terminen aus einem
ICS-Kalender-Feed (Startzeit, Eventname, Ort, Teilnehmerzahl, Notizen) und aktualisiert
sich automatisch.

Es gibt zwei Betriebsarten:

1. **GitHub Pages** (Standard in diesem Repo) – komplett kostenlos, kein eigener Server
   nötig. Ein GitHub-Actions-Workflow holt den Feed alle ~10 Minuten und veröffentlicht
   eine statische Momentaufnahme.
2. **Selbst gehosteter Node-Server** – für „echtes“ Live-Update (Standard: alle 60
   Sekunden), z. B. auf einem eigenen Rechner/Server im Netzwerk.

## Variante 1: GitHub Pages (empfohlen, kostenlos)

Der Workflow [`../.github/workflows/deploy-dashboard.yml`](../.github/workflows/deploy-dashboard.yml):

- läuft bei jedem Push auf `event-dashboard/**`, per Zeitplan (`*/10 * * * *`, alle
  10 Minuten) und manuell über „Run workflow“,
- holt den ICS-Feed direkt über GitHub-Server, baut mit `scripts/build-static.js` ein
  statisches Bundle (`dist/`: HTML/CSS/JS + `api/events.json`),
- veröffentlicht es über die offizielle `actions/deploy-pages`-Action.
- Schlägt der Feed-Abruf fehl, bricht der Job ab **ohne** zu deployen – die zuletzt
  erfolgreich gebaute Version bleibt online sichtbar, statt durch eine leere/fehlerhafte
  Seite ersetzt zu werden.

**Einmalige Einrichtung (im Browser, GitHub-Repo-Einstellungen):**

1. Repo → **Settings → Pages** → bei „Build and deployment“ → Source: **GitHub
   Actions** auswählen (statt „Deploy from a branch“).
2. Optional: Repo → **Settings → Secrets and variables → Actions → Variables**, um
   `ICS_FEED_URL`, `TIMEZONE` oder `REFRESH_INTERVAL_MS` zu überschreiben, falls sich
   der Feed mal ändert.
3. Danach den Workflow einmal manuell anstoßen (Tab **Actions** →
   „Deploy Event Dashboard“ → **Run workflow**) oder auf den Branch pushen.
4. Die Live-URL erscheint danach im Workflow-Log/Deployment (üblicherweise
   `https://<github-user>.github.io/<repo-name>/`).

**Status:** Pages ist als „GitHub Actions“-Quelle aktiviert. Live-URL für dieses Repo:
`https://bubu020885.github.io/Coding/`.

> **Wichtig:** GitHub führt geplante (`schedule`-)Workflows nur auf dem **Default-Branch**
> des Repos aus. Solange dieser Workflow nur auf einem Feature-Branch liegt, funktioniert
> `workflow_dispatch` (manueller Klick) und `push` sofort – die automatische 10-Minuten-
> Aktualisierung startet aber erst, sobald der Branch in den Default-Branch gemergt ist.

**Kompromiss ggü. Variante 2:** Aktualisierung alle ~10 Minuten statt alle 60 Sekunden
(GitHub-Actions-Zeitpläne sind nicht sekundengenau und können sich bei hoher Last
verzögern). Für eine dauerhaft laufende Wandtafel-Anzeige ist das in der Regel
ausreichend.

## Variante 2: Selbst gehosteter Node-Server (echtes Live-Update)

- **Backend** (`server.js`, Node/Express): ruft den ICS-Feed serverseitig ab (nicht im
  Browser – dadurch keine CORS-/Mixed-Content-Probleme, auch weil der Feed nur über
  `http://` erreichbar ist), parst ihn mit `node-ical` (`lib/feed.js`), löst
  wiederkehrende Termine (RRULE) für den relevanten Zeitraum auf und cached das
  Ergebnis. Ein Intervall-Timer holt den Feed alle `REFRESH_INTERVAL_MS` (Standard:
  60 s) neu. Die Route `GET /api/events.json` liefert die aufbereiteten Termine als JSON.

### Setup

```bash
cd event-dashboard
npm install
cp .env.example .env   # bei Bedarf Werte anpassen
npm start
```

Danach ist das Dashboard unter `http://localhost:3000` erreichbar.

### Dauerhaft auf einem Bildschirm anzeigen

1. Server dauerhaft laufen lassen (z. B. per `pm2`, `systemd`-Service oder Docker) auf
   einem Rechner/Server im Netzwerk, den der Bildschirm erreichen kann.
2. Am Bildschirm-Client (Raspberry Pi, Mini-PC, Smart-TV-Browser, …) den Browser im
   Kiosk-Modus auf die Dashboard-URL zeigen lassen, z. B.:
   ```bash
   chromium --kiosk --noerrdialogs --disable-infobars http://<server>:3000
   ```
   (Für die GitHub-Pages-Variante genauso, nur mit der `github.io`-URL statt
   `localhost:3000`.)
3. Für Chromium/Chrome empfiehlt sich zusätzlich eine Erweiterung wie „Kiosk“ oder ein
   Autostart-Skript, das den Browser nach einem Absturz/Neustart automatisch wieder
   öffnet.

### Produktivbetrieb

- `npm start` als Systemdienst betreiben (z. B. `pm2 start server.js --name event-dashboard`).
- Läuft der Feed-Abruf einmal ins Leere (Netzwerkfehler, Feed nicht erreichbar), bleibt
  der zuletzt bekannte Stand sichtbar; der Status-Punkt oben rechts wird rot und
  `error` in `/api/health` gesetzt, bis der nächste Abruf wieder klappt.

## Gemeinsame Konfiguration

Beide Varianten lesen dieselben Umgebungsvariablen (lokal via `.env`, bei GitHub Pages
via Actions-Variables):

| Variable              | Bedeutung                                          | Standard                            |
|------------------------|-----------------------------------------------------|---------------------------------------|
| `PORT`                 | HTTP-Port des Dashboards (nur Variante 2)            | `3000`                                |
| `ICS_FEED_URL`         | URL des ICS-Feeds                                    | (Koronaevent-Feed aus der Anfrage)    |
| `REFRESH_INTERVAL_MS`  | Wie oft der Browser die Daten neu abfragt (ms)       | `60000` (60 s)                        |
| `TIMEZONE`             | Zeitzone für Tagesgrenzen & Anzeige                  | `Europe/Berlin`                       |

## Teilnehmerzahl & Notizen

Der Feed selbst kennt kein eigenes „Teilnehmerzahl“-Feld – die Info steckt (wenn
vorhanden) im `DESCRIPTION`-Text jedes Termins. `lib/feed.js` sucht darin nach Mustern
wie:

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
Zahlenformat wie „12/20 Plätze“), einfach das Regex in `lib/feed.js`
(`PARTICIPANTS_PATTERN`) anpassen – am besten anhand eines echten Beispiel-Termins aus
dem Feed.

> Hinweis: Der Feed war aus der Entwicklungsumgebung dieser Session heraus nicht
> erreichbar (Netzwerk-Policy blockt den Host). Getestet wurde die komplette Logik
> (Parsing, Zeitzonen, wiederkehrende Termine, Teilnehmer-Erkennung, Rendering,
> Static-Build) daher gegen einen lokalen Beispiel-Feed. Bitte nach dem ersten
> erfolgreichen Deploy kurz prüfen, ob die echten Beschreibungstexte des Feeds vom
> Regex erkannt werden – siehe oben.

## Projektstruktur

```
event-dashboard/
├── server.js               Node/Express-Server (Variante 2)
├── lib/feed.js              Gemeinsame Feed-Fetch-/Parse-Logik
├── scripts/build-static.js  Static-Build für GitHub Pages (Variante 1)
├── public/                  Frontend (HTML/CSS/JS)
└── .env.example
.github/workflows/deploy-dashboard.yml   GitHub-Actions-Workflow für Variante 1
```
