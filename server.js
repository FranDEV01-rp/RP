const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const MASTER_KEY = "CarDashSeguro2026";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sseClients = new Map();

// DIAL ARGENTINO COMPLETO CON CDNs GLOBALES VERIFICADAS
const STATIONS = {
  "caba_aspen": {
    name: "Aspen 102.3",
    dial: "102.3 FM",
    city: "Buenos Aires",
    ytChannel: null,
    streams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/ASPEN_SC"
    ]
  },
  "caba_la100": {
    name: "La 100 99.9",
    dial: "99.9 FM",
    city: "Buenos Aires",
    ytChannel: null,
    streams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/LA_100_SC",
      "https://stream.cienradios.com/la100.mp3"
    ]
  },
  "caba_mitre": {
    name: "Radio Mitre AM 790",
    dial: "790 AM",
    city: "Buenos Aires",
    ytChannel: null,
    streams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/MITRE_AM790_SC",
      "https://stream.cienradios.com/mitremp3.mp3"
    ]
  },
  "caba_los40": {
    name: "Los 40 105.5",
    dial: "105.5 FM",
    city: "Buenos Aires",
    ytChannel: null,
    streams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_ARGENTINA_SC"
    ]
  },
  "caba_disney": {
    name: "Radio Disney 94.3",
    dial: "94.3 FM",
    city: "Buenos Aires",
    ytChannel: null,
    streams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/DISNEY_ARG_SC"
    ]
  },
  "caba_continental": {
    name: "Radio Continental AM 590",
    dial: "590 AM",
    city: "Buenos Aires",
    ytChannel: null,
    streams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/CONTINENTAL_SC",
      "https://stream.zeno.fm/4w9w03hn01zuv"
    ]
  },
  "caba_rivadavia": {
    name: "Radio Rivadavia AM 630",
    dial: "630 AM",
    city: "Buenos Aires",
    ytChannel: null,
    streams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/RIVADAVIA_SC",
      "https://stream.zeno.fm/k2k0mwhm5rhvv"
    ]
  },
  "cba_cadena3": {
    name: "Cadena 3 100.9",
    dial: "100.9 FM / 700 AM",
    city: "Córdoba",
    ytChannel: null,
    streams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/CADENA3_SC",
      "https://cadena3.streamguys1.com/cadena3"
    ]
  },
  "ros_vida": {
    name: "FM Vida Rosario 97.9",
    dial: "97.9 FM",
    city: "Rosario, Santa Fe",
    ytChannel: "@fmvida979",
    streams: [
      "https://streaming.rosario3.com/fmvida/live/playlist.m3u8",
      "https://stream.zeno.fm/9uvrtub5puzuv",
      "http://stream.rosario3.com/fmvida.mp3"
    ]
  },
  "ros_1003": {
    name: "FM 100.3 Rosario (Boing)",
    dial: "100.3 FM",
    city: "Rosario, Santa Fe",
    ytChannel: null,
    streams: [
      "https://stream.zeno.fm/6y2x37n5t7zuv",
      "https://streaming.redboing.com/boing",
      "http://stream.boing973.com/boing"
    ]
  },
  "caba_urbanaplay": {
    name: "Urbana Play 104.3",
    dial: "104.3 FM",
    city: "Buenos Aires",
    ytChannel: "@UrbanaPlayFM",
    streams: [
      "https://urbanaplay.stream.mediasector.es/urbanaplay-ba.mp3",
      "https://stream.zeno.fm/f8y0u69u21zuv",
      "https://icecast.urbanaplayfm.com/urbanaplay.mp3"
    ]
  },
  "caba_pop": {
    name: "Pop Radio 101.5",
    dial: "101.5 FM",
    city: "Buenos Aires",
    ytChannel: null,
    streams: [
      "https://pop.streamindalo.com.ar/pop.mp3",
      "http://stream.indalo.com.ar/pop.mp3"
    ]
  },
  "caba_mega": {
    name: "Mega 98.3",
    dial: "98.3 FM",
    city: "Buenos Aires",
    ytChannel: null,
    streams: [
      "https://mega.streamindalo.com.ar/mega.mp3",
      "http://stream.indalo.com.ar/mega.mp3"
    ]
  },
  "caba_vale": {
    name: "Radio Vale 97.5",
    dial: "97.5 FM",
    city: "Buenos Aires",
    ytChannel: null,
    streams: [
      "https://vale.streamindalo.com.ar/vale.mp3"
    ]
  },
  "caba_radio10": {
    name: "Radio 10 AM 710",
    dial: "710 AM",
    city: "Buenos Aires",
    ytChannel: null,
    streams: [
      "https://radio10.streamindalo.com.ar/radio10.mp3"
    ]
  }
};

// Búsqueda del video en vivo activo en YouTube
function resolveYouTubeLive(channelHandle) {
  return new Promise((resolve) => {
    if (!channelHandle) return resolve(null);
    const targetUrl = `https://www.youtube.com/${channelHandle}/live`;
    const req = https.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123.0.0.0 Safari/537.36'
      },
      timeout: 2500
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const match = data.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (match && match[1]) {
          resolve(match[1]);
        } else {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Proxy de transmisión para convertir streams HTTP/ICY en HTTPS limpio
function proxyAudioStream(urls, index, req, res) {
  if (index >= urls.length) {
    if (!res.headersSent) res.status(502).send("Servidores no disponibles");
    return;
  }

  const currentUrl = urls[index];
  let parsed;
  try {
    parsed = new URL(currentUrl);
  } catch (e) {
    return proxyAudioStream(urls, index + 1, req, res);
  }

  const client = parsed.protocol === 'https:' ? https : http;
  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: 'GET',
    headers: {
      'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
      'Accept': '*/*',
      'Icy-MetaData': '0'
    },
    insecureHTTPParser: true,
    rejectUnauthorized: false,
    timeout: 6000
  };

  const proxyReq = client.request(options, (upstream) => {
    if (upstream.statusCode >= 300 && upstream.statusCode < 400 && upstream.headers.location) {
      let nextUrl = upstream.headers.location;
      if (!nextUrl.startsWith('http')) nextUrl = new URL(nextUrl, currentUrl).href;
      proxyReq.destroy();
      return proxyAudioStream([nextUrl, ...urls.slice(index + 1)], 0, req, res);
    }

    if (upstream.statusCode !== 200 && upstream.statusCode !== 206) {
      proxyReq.destroy();
      return proxyAudioStream(urls, index + 1, req, res);
    }

    res.writeHead(200, {
      'Content-Type': upstream.headers['content-type'] || 'audio/mpeg',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store'
    });

    upstream.pipe(res);
    req.on('close', () => proxyReq.destroy());
  });

  proxyReq.on('error', () => proxyAudioStream(urls, index + 1, req, res));
  proxyReq.on('timeout', () => { proxyReq.destroy(); proxyAudioStream(urls, index + 1, req, res); });
  proxyReq.end();
}

app.get('/api/stream-proxy', (req, res) => {
  const station = STATIONS[req.query.id];
  if (!station || !station.streams) return res.status(404).send("No encontrada");
  proxyAudioStream(station.streams, 0, req, res);
});

app.get('/api/station-info', async (req, res) => {
  const station = STATIONS[req.query.id];
  if (!station) return res.status(404).json({ error: "No encontrada" });

  let ytVideoId = null;
  if (station.ytChannel) {
    ytVideoId = await resolveYouTubeLive(station.ytChannel);
  }

  res.json({
    stationId: req.query.id,
    name: station.name,
    dial: station.dial,
    city: station.city,
    ytVideoId: ytVideoId,
    streams: station.streams,
    proxyUrl: `/api/stream-proxy?id=${req.query.id}&t=${Date.now()}`
  });
});

app.get('/events', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).send("Falta userId");

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  sseClients.set(String(userId), res);

  const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(String(userId));
  });
});

app.post('/api/control', (req, res) => {
  if (req.headers['x-auth-token'] !== MASTER_KEY) return res.status(403).json({ error: "No autorizado" });
  const { userId, system, action, data } = req.body;
  if (!userId || !system || !action) return res.status(400).json({ error: "Faltan datos" });

  const client = sseClients.get(String(userId));
  if (client) client.write(`data: ${JSON.stringify({ system, action, data })}\n\n`);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Receptor funcionando en puerto ${PORT}`);
});
