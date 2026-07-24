require('dotenv').config({ quiet: true });

const express = require('express');
const path = require('path');
const { fetchEvents } = require('./lib/feed');

const PORT = process.env.PORT || 3000;
const FEED_URL = process.env.ICS_FEED_URL ||
  'http://mmc.api.koronaevent.de/api/feeds/62Rw4Z0JIao6bz9sae5ErIONwx0_MQ9EFuKcTxLVBEQ.ics';
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS || 60_000);
const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin';

let cache = {
  fetchedAt: null,
  error: null,
  events: [],
};

async function refreshCache() {
  try {
    const events = await fetchEvents(FEED_URL);
    cache = { fetchedAt: new Date().toISOString(), error: null, events };
    console.log(`[${new Date().toISOString()}] Feed aktualisiert: ${events.length} Termine`);
  } catch (err) {
    cache = { ...cache, error: err.message, fetchedAt: cache.fetchedAt };
    console.error(`[${new Date().toISOString()}] Fehler beim Laden des Feeds:`, err.message);
  }
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/events.json', (req, res) => {
  res.json({
    fetchedAt: cache.fetchedAt,
    error: cache.error,
    timezone: TIMEZONE,
    refreshIntervalMs: REFRESH_INTERVAL_MS,
    events: cache.events,
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: !cache.error, fetchedAt: cache.fetchedAt });
});

refreshCache();
setInterval(refreshCache, REFRESH_INTERVAL_MS);

app.listen(PORT, () => {
  console.log(`Event Dashboard läuft auf http://localhost:${PORT}`);
  console.log(`Feed-Quelle: ${FEED_URL}`);
});
