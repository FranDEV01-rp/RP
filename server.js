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

// Base de datos completa de emisoras argentinas (Rosario, Buenos Aires, Córdoba)
const STATIONS = {
  "caba_urbanaplay": {
    name: "Urbana Play 104.3",
    dial: "104.3 FM",
    city: "Buenos Aires",
    ytChannel: "@UrbanaPlayFM",
    urls: [
      "https://stream.zeno.fm/f8y0u69u21zuv",
      "https://stream.zeno.fm/0r0xa79u21zuv",
      "https://urbanaplay.stream.mediasector.es/urbanaplay-ba.mp3"
    ]
  },
  "ros_vida": {
    name: "FM Vida Rosario 97.9",
    dial: "97.9 FM",
    city: "Rosario, Santa Fe",
    ytChannel: "@fmvida979",
    urls: [
      "https://stream.zeno.fm/9uvrtub5puzuv",
      "https://stream.rosario3.com/fmvida.mp3",
      "http://stream.rosario3.com/fmvida.mp3",
      "https://streaming.rosario3.com/fmvida/live/playlist.m3u8"
    ]
  },
  "ros_1003": {
    name: "FM 100.3 Rosario (Boing)",
    dial: "100.3 FM",
    city: "Rosario, Santa Fe",
    ytChannel: null,
    urls: [
      "https://stream.zeno.fm/6y2x37n5t7zuv",
      "https://stream.boing973.com/boing",
      "http://stream.boing973.com/boing"
    ]
  },
  "caba_aspen": {
    name: "Aspen 102.3",
    dial: "102.3 FM",
    city: "Buenos Aires",
    ytChannel: null,
    urls: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/ASPEN_SC",
      "https://edge.audio.aspen1023.com.ar/aspen.mp3"
    ]
  },
  "caba_la100": {
    name: "La 100 99.9",
    dial: "99.9 FM",
    city: "Buenos Aires",
    ytChannel: null,
    urls: [
      "https://stream.cienradios.com/la100.mp3",
      "https://playerservices.streamtheworld.com/api/livestream-redirect/LA_100_SC"
    ]
  },
  "caba_mitre": {
    name: "Radio Mitre AM 790",
    dial: "790 AM",
    city: "Buenos Aires",
    ytChannel: null,
    urls: [
      "https://stream.cienradios.com/mitremp3.mp3",
      "https://playerservices.streamtheworld.com/api/livestream-redirect/MITRE_AM790_SC"
    ]
  },
  "caba_pop": {
    name: "Pop Radio 101.5",
    dial: "101.5 FM",
    city: "Buenos Aires",
    ytChannel: null,
    urls: [
      "https://pop.streamindalo.com.ar/pop.mp3",
      "https://stream.indalo.com.ar/pop.mp3"
    ]
  },
  "caba_mega": {
    name: "Mega 98.3",
    dial: "98.3 FM",
    city: "Buenos Aires",
    ytChannel: null,
    urls: [
      "https://mega.streamindalo.com.ar/mega.mp3",
      "https://stream.indalo.com.ar/mega.mp3"
    ]
  },
  "caba_los40": {
    name: "Los 40 105.5",
    dial: "105.5 FM",
    city: "Buenos Aires",
    ytChannel: null,
    urls: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_ARGENTINA_SC"
    ]
  },
  "caba_disney": {
    name: "Radio Disney 94.3",
    dial: "94.3 FM",
    city: "Buenos Aires",
    ytChannel: null,
    urls: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/DISNEY_ARG_SC"
    ]
  },
  "cba_cadena3": {
    name: "Cadena 3 100.9",
    dial: "100.9 FM / 700 AM",
    city: "Córdoba",
    ytChannel: null,
    urls: [
      "https://cadena3.streamguys1.com/cadena3",
      "https://playerservices.streamtheworld.com/api/livestream-redirect/CADENA3_SC"
    ]
  },
  "caba_vale": {
    name: "Radio Vale 97.5",
    dial: "97.5 FM",
    city: "Buenos Aires",
    ytChannel: null,
    urls: [
      "https://vale.streamindalo.com.ar/vale.mp3"
    ]
  },
  "caba_radio10": {
    name: "Radio 10 AM 710",
    dial: "710 AM",
    city: "Buenos Aires",
    ytChannel: null,
    urls: [
      "https://radio10.streamindalo.com.ar/radio10.mp3"
    ]
  },
  "caba_rivadavia": {
    name: "Radio Rivadavia AM 630",
    dial: "630 AM",
    city: "Buenos Aires",
    ytChannel: null,
    urls: [
      "https://stream.zeno.fm/k2k0mwhm5rhvv",
      "https://playerservices.streamtheworld.com/api/livestream-redirect/RIVADAVIA_SC"
    ]
  },
  "caba_continental": {
    name: "Radio Continental AM 590",
    dial: "590 AM",
    city: "Buenos Aires",
    ytChannel: null,
    urls: [
      "https://stream.zeno.fm/4w9w03hn01zuv"
    ]
  }
};

// Cliente HTTP con soporte para respuestas Shoutcast (insecureHTTPParser) y seguimiento de redirecciones
function streamAudioWithFallback(urlList, index, req, res) {
  if (index >= urlList.length) {
    if (!res.headersSent) {
      res.status(502).send("Todos los servidores de la emisora fallaron");
    }
    return;
  }

  const currentUrl = urlList[index];
  let parsedUrl;
  try {
    parsedUrl = new URL(currentUrl);
  } catch (err) {
    return streamAudioWithFallback(urlList, index + 1, req, res);
  }

  const clientLib = parsedUrl.protocol === 'https:' ? https : http;
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      'Accept': '*/*',
      'Icy-MetaData': '0'
    },
    insecureHTTPParser: true, // Crucial para admitir respuestas ICY 200 OK de radios argentinas
    rejectUnauthorized: false,
    timeout: 8000
  };

  const proxyReq = clientLib.request(options, (upstreamRes) => {
    // Si la emisora redirige (301, 302, 307)
    if (upstreamRes.statusCode >= 300 && upstreamRes.statusCode < 400 && upstreamRes.headers.location) {
      let nextUrl = upstreamRes.headers.location;
      if (!nextUrl.startsWith('http')) {
        nextUrl = new URL(nextUrl, currentUrl).href;
      }
      proxyReq.destroy();
      return streamAudioWithFallback([nextUrl, ...urlList.slice(index + 1)], 0, req, res);
    }

    if (upstreamRes.statusCode !== 200 && upstreamRes.statusCode !== 206) {
      proxyReq.destroy();
      return streamAudioWithFallback(urlList, index + 1, req, res);
    }

    res.setHeader('Content-Type', upstreamRes.headers['content-type'] || 'audio/mpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store');

    upstreamRes.pipe(res);

    req.on('close', () => {
      proxyReq.destroy();
    });
  });

  proxyReq.on('error', () => {
    streamAudioWithFallback(urlList, index + 1, req, res);
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    streamAudioWithFallback(urlList, index + 1, req, res);
  });

  proxyReq.end();
}

// Endpoint de streaming a través del proxy del servidor
app.get('/api/stream-proxy', (req, res) => {
  const stationId = req.query.id;
  const station = STATIONS[stationId];

  if (!station || !station.urls || station.urls.length === 0) {
    return res.status(404).send("Emisora no registrada");
  }

  streamAudioWithFallback(station.urls, 0, req, res);
});

// Endpoint de información y listas de servidores
app.get('/api/station-info', (req, res) => {
  const stationId = req.query.id;
  const station = STATIONS[stationId];
  if (!station) {
    return res.status(404).json({ error: "No encontrada" });
  }
  return res.json({
    stationId: stationId,
    name: station.name,
    dial: station.dial,
    city: station.city,
    directUrls: station.urls,
    proxyUrl: `/api/stream-proxy?id=${stationId}&t=${Date.now()}`
  });
});

// SSE para conexión en vivo con el navegador del conductor
app.get('/events', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).send("Falta userId");

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  sseClients.set(String(userId), res);

  const heartbeat = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(String(userId));
  });
});

// Endpoint de control desde Roblox
app.post('/api/control', (req, res) => {
  if (req.headers['x-auth-token'] !== MASTER_KEY) {
    return res.status(403).json({ error: "No autorizado" });
  }

  const { userId, system, action, data } = req.body;
  if (!userId || !system || !action) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  const client = sseClients.get(String(userId));
  if (client) {
    client.write(`data: ${JSON.stringify({ system, action, data })}\n\n`);
  }

  return res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Receptor Maestro ejecutándose en puerto ${PORT}`);
});
