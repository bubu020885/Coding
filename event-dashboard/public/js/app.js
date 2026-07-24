(() => {
  const COLUMN_COUNT = 3;
  const DEFAULT_POLL_MS = 30_000;
  const FALLBACK_TIMEZONE = 'Europe/Berlin';

  const columnsEl = document.getElementById('columns');
  const columnTemplate = document.getElementById('column-template');
  const eventTemplate = document.getElementById('event-template');
  const statusDot = document.getElementById('status-dot');
  const lastUpdatedEl = document.getElementById('last-updated');
  const clockEl = document.getElementById('clock');

  let timezone = FALLBACK_TIMEZONE;
  let pollMs = DEFAULT_POLL_MS;
  let loadedOnDateKey = null;
  let pollTimer = null;

  function dateKey(date, tz) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function buildColumnDates() {
    const now = new Date();
    return [0, 1, 2].map((offset) => addDays(now, offset));
  }

  function formatWeekday(date, tz) {
    return new Intl.DateTimeFormat('de-DE', { timeZone: tz, weekday: 'long' }).format(date);
  }

  function formatDate(date, tz) {
    return new Intl.DateTimeFormat('de-DE', {
      timeZone: tz,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }

  function formatTime(isoString, tz) {
    return new Intl.DateTimeFormat('de-DE', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoString));
  }

  function ensureColumns() {
    if (columnsEl.children.length === COLUMN_COUNT) return;
    columnsEl.innerHTML = '';
    for (let i = 0; i < COLUMN_COUNT; i++) {
      const node = columnTemplate.content.cloneNode(true);
      columnsEl.appendChild(node);
    }
  }

  function renderColumns(events) {
    ensureColumns();
    const columnDates = buildColumnDates();
    const columnEls = columnsEl.querySelectorAll('.column');
    const todayKey = dateKey(columnDates[0], timezone);
    const now = new Date();

    const grouped = new Map();
    for (const date of columnDates) {
      grouped.set(dateKey(date, timezone), []);
    }
    for (const ev of events) {
      const key = dateKey(new Date(ev.start), timezone);
      if (grouped.has(key)) grouped.get(key).push(ev);
    }

    columnDates.forEach((date, idx) => {
      const columnEl = columnEls[idx];
      const key = dateKey(date, timezone);
      const isToday = key === todayKey;

      columnEl.classList.toggle('is-today', isToday);
      columnEl.querySelector('.weekday').textContent = isToday
        ? `Heute – ${formatWeekday(date, timezone)}`
        : idx === 1
        ? `Morgen – ${formatWeekday(date, timezone)}`
        : `Übermorgen – ${formatWeekday(date, timezone)}`;
      columnEl.querySelector('.date').textContent = formatDate(date, timezone);

      const listEl = columnEl.querySelector('.event-list');
      listEl.innerHTML = '';

      const dayEvents = (grouped.get(key) || []).slice().sort(
        (a, b) => new Date(a.start) - new Date(b.start)
      );

      if (dayEvents.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'Keine Termine';
        listEl.appendChild(empty);
        return;
      }

      for (const ev of dayEvents) {
        const card = eventTemplate.content.cloneNode(true);
        const cardEl = card.querySelector('.event-card');
        const start = new Date(ev.start);
        const end = new Date(ev.end);

        cardEl.querySelector('.event-time').textContent = ev.allDay
          ? 'Ganztägig'
          : `${formatTime(ev.start, timezone)}${ev.end ? ' – ' + formatTime(ev.end, timezone) : ''}`;
        cardEl.querySelector('.event-name').textContent = ev.summary;
        cardEl.querySelector('.event-location').textContent = ev.location || '';
        cardEl.querySelector('.event-notes').textContent = ev.notes || '';
        cardEl.querySelector('.participants-count').textContent =
          ev.participants != null ? ev.participants : '';

        if (isToday && !ev.allDay) {
          if (end <= now) cardEl.classList.add('is-past');
          else if (start <= now && now < end) cardEl.classList.add('is-live');
        }

        listEl.appendChild(card);
      }
    });
  }

  function setStatus(ok) {
    statusDot.classList.toggle('ok', ok);
    statusDot.classList.toggle('error', !ok);
  }

  function updateLastUpdated(iso) {
    if (!iso) {
      lastUpdatedEl.textContent = 'noch keine Daten';
      return;
    }
    lastUpdatedEl.textContent = `Aktualisiert: ${formatTime(iso, timezone)}`;
  }

  let cachedEvents = [];

  async function loadEvents() {
    try {
      const res = await fetch('/api/events', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      timezone = data.timezone || FALLBACK_TIMEZONE;
      pollMs = data.refreshIntervalMs || DEFAULT_POLL_MS;
      cachedEvents = data.events || [];

      setStatus(!data.error);
      updateLastUpdated(data.fetchedAt);
      renderColumns(cachedEvents);

      if (loadedOnDateKey === null) {
        loadedOnDateKey = dateKey(new Date(), timezone);
      }
    } catch (err) {
      setStatus(false);
      console.error('Fehler beim Laden der Termine:', err);
    }
  }

  function tickClock() {
    const now = new Date();
    clockEl.textContent = new Intl.DateTimeFormat('de-DE', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(now);

    // Roll the whole board over at midnight so "Heute/Morgen/Übermorgen"
    // stay correct on an unattended, always-on display.
    const currentKey = dateKey(now, timezone);
    if (loadedOnDateKey && currentKey !== loadedOnDateKey) {
      window.location.reload();
    }
  }

  function schedulePolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(loadEvents, pollMs);
  }

  loadEvents().then(schedulePolling);
  setInterval(tickClock, 1000);
  // Separate from polling: keeps is-past/is-live highlighting current
  // between fetches without re-rendering the whole board every second.
  setInterval(() => {
    if (cachedEvents.length) renderColumns(cachedEvents);
  }, 15_000);
})();
