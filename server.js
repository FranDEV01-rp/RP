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

// DIAL DE EMISORAS ARGENTINAS (Servidores de audio oficiales)
const STATIONS = {
  "caba_aspen": {
    name: "Aspen 102.3",
    dial: "102.3 FM",
    city: "Buenos Aires",
    urls: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/ASPEN_SC"
    ]
  },
  "ros_vida": {
    name: "FM Vida Rosario 97.9",
    dial: "97.9 FM",
    city: "Rosario, Santa Fe",
    urls: [
      "https://stream.zeno.fm/9uvrtub5puzuv",
      "http://streaming.rosario3.com:8000/fmvida",
      "https://stream.zeno.fm/s4k8yv405qzuv"
    ]
  },
  "caba_urbanaplay": {
    name: "Urbana Play 104.3",
    dial: "104.3 FM",
    city: "Buenos Aires",
    urls: [
      "https://urbanaplay.stream.mediasector.es/urbanaplay-ba.mp3",
      "https://stream.zeno.fm/f8y0u69u21zuv",
      "http://icecast.urbanaplayfm.com/urbanaplay.mp3"
    ]
  },
  "ros_1003": {
    name: "FM 100.3 Rosario (Boing)",
    dial: "100.3 FM",
    city: "Rosario, Santa Fe",
    urls: [
      "https://stream.zeno.fm/6y2x37n5t7zuv",
      "http://stream.boing973.com/boing"
    ]
  },
  "caba_la100": {
    name: "La 100 99.9",
    dial: "99.9 FM",
    city: "Buenos Aires",
    urls: [
      "https://stream.cienradios.com/la100.mp3",
      "https://playerservices.streamtheworld.com/api/livestream-redirect/LA_100_SC"
    ]
  },
  "caba_mitre": {
    name: "Radio Mitre AM 790",
    dial: "790 AM",
    city: "Buenos Aires",
    urls: [
      "https://stream.cienradios.com/mitremp3.mp3",
      "https://playerservices.streamtheworld.com/api/livestream-redirect/MITRE_AM790_SC"
    ]
  },
  "caba_los40": {
    name: "Los 40 105.5",
    dial: "105.5 FM",
    city: "Buenos Aires",
    urls: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_ARGENTINA_SC"
    ]
  },
  "caba_disney": {
    name: "Radio Disney 94.3",
    dial: "94.3 FM",
    city: "Buenos Aires",
    urls: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/DISNEY_ARG_SC"
    ]
  },
  "cba_cadena3": {
    name: "Cadena 3 100.9",
    dial: "100.9 FM / 700 AM",
    city: "Córdoba",
    urls: [
      "https://cadena3.streamguys1.com/cadena3",
      "https://playerservices.streamtheworld.com/api/livestream-redirect/CADENA3_SC"
    ]
  },
  "caba_pop": {
    name: "Pop Radio 101.5",
    dial: "101.5 FM",
    city: "Buenos Aires",
    urls: [
      "https://pop.streamindalo.com.ar/pop.mp3",
      "http://stream.indalo.com.ar/pop.mp3"
    ]
  },
  "caba_mega": {
    name: "Mega 98.3",
    dial: "98.3 FM",
    city: "Buenos Aires",
    urls: [
      "https://mega.streamindalo.com.ar/mega.mp3",
      "http://stream.indalo.com.ar/mega.mp3"
    ]
  },
  "caba_continental": {
    name: "Radio Continental AM 590",
    dial: "590 AM",
    city: "Buenos Aires",
    urls: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/CONTINENTAL_SC",
      "https://stream.zeno.fm/4w9w03hn01zuv"
    ]
  },
  "caba_rivadavia": {
    name: "Radio Rivadavia AM 630",
    dial: "630 AM",
    city: "Buenos Aires",
    urls: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/RIVADAVIA_SC",
      "https://stream.zeno.fm/k2k0mwhm5rhvv"
    ]
  },
  "caba_vale": {
    name: "Radio Vale 97.5",
    dial: "97.5 FM",
    city: "Buenos Aires",
    urls: [
      "https://vale.streamindalo.com.ar/vale.mp3"
    ]
  },
  "caba_radio10": {
    name: "Radio 10 AM 710",
    dial: "710 AM",
    city: "Buenos Aires",
    urls: [
      "https://radio10.streamindalo.com.ar/radio10.mp3"
    ]
  }
};

// Proxy de audio: conecta a servidores HTTP/HTTPS, sigue redirecciones y emite MP3 seguro
function proxyRadioStream(candidates, index, req, res, hops = 0) {
  if (index >= candidates.length || hops > 5) {
    if (!res.headersSent) {
      res.status(502).send("Todos los servidores de la emisora fallaron");
    }
    return;
  }

  const targetUrl = candidates[index];
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (err) {
    return proxyRadioStream(candidates, index + 1, req, res, 0);
  }

  const transport = parsed.protocol === 'https:' ? https : http;
  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123.0.0.0',
      'Accept': '*/*',
      'Icy-MetaData': '0'
    },
    insecureHTTPParser: true,
    rejectUnauthorized: false,
    timeout: 6000
  };

  const upstreamReq = transport.request(options, (upstreamRes) => {
    // Manejo de redirecciones 301, 302, 307
    if (upstreamRes.statusCode >= 300 && upstreamRes.statusCode < 400 && upstreamRes.headers.location) {
      let nextUrl = upstreamRes.headers.location;
      if (!nextUrl.startsWith('http')) {
        nextUrl = new URL(nextUrl, targetUrl).href;
      }
      upstreamReq.destroy();
      return proxyRadioStream([nextUrl, ...candidates.slice(index + 1)], 0, req, res, hops + 1);
    }

    if (upstreamRes.statusCode !== 200 && upstreamRes.statusCode !== 206) {
      upstreamReq.destroy();
      return proxyRadioStream(candidates, index + 1, req, res, 0);
    }

    // Cabeceras limpias que el navegador de la PC reproduce al 100%
    res.writeHead(200, {
      'Content-Type': upstreamRes.headers['content-type'] || 'audio/mpeg',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive'
    });

    upstreamRes.pipe(res);

    req.on('close', () => {
      upstreamReq.destroy();
    });
  });

  upstreamReq.on('error', () => {
    proxyRadioStream(candidates, index + 1, req, res, 0);
  });

  upstreamReq.on('timeout', () => {
    upstreamReq.destroy();
    proxyRadioStream(candidates, index + 1, req, res, 0);
  });

  upstreamReq.end();
}

// Endpoint de reproducción de la radio a través del túnel seguro de Render
app.get('/api/radio-stream', (req, res) => {
  const station = STATIONS[req.query.id];
  if (!station || !station.urls || station.urls.length === 0) {
    return res.status(404).send("Emisora no registrada");
  }
  proxyRadioStream(station.urls, 0, req, res, 0);
});

// Endpoint de información para la interfaz
app.get('/api/station-info', (req, res) => {
  const station = STATIONS[req.query.id];
  if (!station) return res.status(404).json({ error: "No encontrada" });

  res.json({
    stationId: req.query.id,
    name: station.name,
    dial: station.dial,
    city: station.city,
    directBackup: station.urls[0]
  });
});

// SSE para sincronizar con Roblox
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

// Endpoint de control desde Roblox
app.post('/api/control', (req, res) => {
  if (req.headers['x-auth-token'] !== MASTER_KEY) return res.status(403).json({ error: "No autorizado" });
  const { userId, system, action, data } = req.body;
  if (!userId || !system || !action) return res.status(400).json({ error: "Faltan datos" });

  const client = sseClients.get(String(userId));
  if (client) client.write(`data: ${JSON.stringify({ system, action, data })}\n\n`);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Receptor Maestro ejecutándose en puerto ${PORT}`);
});
