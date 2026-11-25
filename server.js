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

// DIAL COMPLETO DE EMISORAS ARGENTINAS (Rosario, Buenos Aires, Córdoba)
const STATIONS = {
  "caba_urbanaplay": {
    name: "Urbana Play 104.3",
    dial: "104.3 FM",
    city: "Buenos Aires",
    scrapeUrl: "https://urbanaplayfm.com/radio/",
    directUrls: [
      "https://urbanaplay.stream.mediasector.es/urbanaplay-ba.mp3",
      "https://icecast.urbanaplayfm.com/urbanaplay.mp3",
      "https://stream.zeno.fm/f8y0u69u21zuv"
    ]
  },
  "ros_vida": {
    name: "FM Vida Rosario 97.9",
    dial: "97.9 FM",
    city: "Rosario, Santa Fe",
    scrapeUrl: null,
    directUrls: [
      "http://stream.rosario3.com/fmvida.mp3",
      "http://streaming.rosario3.com:8000/fmvida",
      "https://stream.zeno.fm/9uvrtub5puzuv"
    ]
  },
  "ros_1003": {
    name: "FM 100.3 Rosario (Boing)",
    dial: "100.3 FM",
    city: "Rosario, Santa Fe",
    scrapeUrl: null,
    directUrls: [
      "http://stream.boing973.com/boing",
      "https://stream.zeno.fm/6y2x37n5t7zuv"
    ]
  },
  "caba_aspen": {
    name: "Aspen 102.3",
    dial: "102.3 FM",
    city: "Buenos Aires",
    scrapeUrl: null,
    directUrls: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/ASPEN_SC"
    ]
  },
  "caba_la100": {
    name: "La 100 99.9",
    dial: "99.9 FM",
    city: "Buenos Aires",
    scrapeUrl: null,
    directUrls: [
      "https://stream.cienradios.com/la100.mp3",
      "https://playerservices.streamtheworld.com/api/livestream-redirect/LA_100_SC"
    ]
  },
  "caba_mitre": {
    name: "Radio Mitre AM 790",
    dial: "790 AM",
    city: "Buenos Aires",
    scrapeUrl: null,
    directUrls: [
      "https://stream.cienradios.com/mitremp3.mp3",
      "https://playerservices.streamtheworld.com/api/livestream-redirect/MITRE_AM790_SC"
    ]
  },
  "caba_pop": {
    name: "Pop Radio 101.5",
    dial: "101.5 FM",
    city: "Buenos Aires",
    scrapeUrl: null,
    directUrls: [
      "https://pop.streamindalo.com.ar/pop.mp3",
      "http://stream.indalo.com.ar/pop.mp3"
    ]
  },
  "caba_mega": {
    name: "Mega 98.3",
    dial: "98.3 FM",
    city: "Buenos Aires",
    scrapeUrl: null,
    directUrls: [
      "https://mega.streamindalo.com.ar/mega.mp3",
      "http://stream.indalo.com.ar/mega.mp3"
    ]
  },
  "caba_los40": {
    name: "Los 40 105.5",
    dial: "105.5 FM",
    city: "Buenos Aires",
    scrapeUrl: null,
    directUrls: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_ARGENTINA_SC"
    ]
  },
  "caba_disney": {
    name: "Radio Disney 94.3",
    dial: "94.3 FM",
    city: "Buenos Aires",
    scrapeUrl: null,
    directUrls: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/DISNEY_ARG_SC"
    ]
  },
  "cba_cadena3": {
    name: "Cadena 3 100.9",
    dial: "100.9 FM / 700 AM",
    city: "Córdoba",
    scrapeUrl: null,
    directUrls: [
      "https://cadena3.streamguys1.com/cadena3",
      "https://playerservices.streamtheworld.com/api/livestream-redirect/CADENA3_SC"
    ]
  },
  "caba_vale": {
    name: "Radio Vale 97.5",
    dial: "97.5 FM",
    city: "Buenos Aires",
    scrapeUrl: null,
    directUrls: [
      "https://vale.streamindalo.com.ar/vale.mp3"
    ]
  },
  "caba_radio10": {
    name: "Radio 10 AM 710",
    dial: "710 AM",
    city: "Buenos Aires",
    scrapeUrl: null,
    directUrls: [
      "https://radio10.streamindalo.com.ar/radio10.mp3"
    ]
  },
  "caba_rivadavia": {
    name: "Radio Rivadavia AM 630",
    dial: "630 AM",
    city: "Buenos Aires",
    scrapeUrl: null,
    directUrls: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/RIVADAVIA_SC",
      "https://stream.zeno.fm/k2k0mwhm5rhvv"
    ]
  },
  "caba_continental": {
    name: "Radio Continental AM 590",
    dial: "590 AM",
    city: "Buenos Aires",
    scrapeUrl: null,
    directUrls: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/CONTINENTAL_SC",
      "https://stream.zeno.fm/4w9w03hn01zuv"
    ]
  }
};

// Función auxiliar para obtener contenido web oficial (Scraping seguro)
function fetchPageContent(targetUrl, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.request({
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123.0.0.0 Safari/537.36'
        },
        timeout: timeoutMs
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let next = res.headers.location;
          if (!next.startsWith('http')) next = new URL(next, targetUrl).href;
          return resolve(fetchPageContent(next, timeoutMs));
        }
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve(body));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

// Proxy de Audio Inverso: Soporta Shoutcast (ICY), sigue redirecciones y emite HTTPS nativo al navegador
function forwardStream(urlList, index, req, res, redirectCount = 0) {
  if (index >= urlList.length || redirectCount > 6) {
    if (!res.headersSent) {
      res.status(502).send("Todos los servidores de la radio están fuera de línea");
    }
    return;
  }

  const currentUrl = urlList[index];
  let parsedUrl;
  try {
    parsedUrl = new URL(currentUrl);
  } catch (err) {
    return forwardStream(urlList, index + 1, req, res, 0);
  }

  const clientLib = parsedUrl.protocol === 'https:' ? https : http;
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: {
      'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
      'Accept': '*/*',
      'Icy-MetaData': '0'
    },
    insecureHTTPParser: true, // Imprescindible para responder a cabeceras ICY 200 OK de radios argentinas
    rejectUnauthorized: false,
    timeout: 5000
  };

  const proxyReq = clientLib.request(options, (upstreamRes) => {
    // Manejo transparente de redirecciones HTTP 301, 302, 307
    if (upstreamRes.statusCode >= 300 && upstreamRes.statusCode < 400 && upstreamRes.headers.location) {
      let nextUrl = upstreamRes.headers.location;
      if (!nextUrl.startsWith('http')) {
        nextUrl = new URL(nextUrl, currentUrl).href;
      }
      proxyReq.destroy();
      return forwardStream([nextUrl, ...urlList.slice(index + 1)], 0, req, res, redirectCount + 1);
    }

    if (upstreamRes.statusCode !== 200 && upstreamRes.statusCode !== 206) {
      proxyReq.destroy();
      return forwardStream(urlList, index + 1, req, res, 0);
    }

    // Cabeceras HTTPS nativas para evitar bloqueo de contenido mixto en el navegador
    res.writeHead(200, {
      'Content-Type': upstreamRes.headers['content-type'] || 'audio/mpeg',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive'
    });

    upstreamRes.pipe(res);

    req.on('close', () => {
      proxyReq.destroy();
    });
  });

  proxyReq.on('error', () => {
    forwardStream(urlList, index + 1, req, res, 0);
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    forwardStream(urlList, index + 1, req, res, 0);
  });

  proxyReq.end();
}

// Endpoint del proxy de transmisión HTTPS
app.get('/api/stream-proxy', (req, res) => {
  const stationId = req.query.id;
  const station = STATIONS[stationId];

  if (!station || !station.directUrls || station.directUrls.length === 0) {
    return res.status(404).send("Emisora no registrada");
  }

  forwardStream(station.directUrls, 0, req, res);
});

// Endpoint de información y resolución de emisora (llamado durante la estática de 5 segundos)
app.get('/api/station-info', async (req, res) => {
  const stationId = req.query.id;
  const station = STATIONS[stationId];

  if (!station) {
    return res.status(404).json({ error: "No encontrada" });
  }

  let scrapedYoutubeId = null;

  // Búsqueda en sitio web oficial (ej. Urbana Play)
  if (station.scrapeUrl) {
    try {
      const pageHtml = await fetchPageContent(station.scrapeUrl, 2200);
      const match = pageHtml.match(/(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (match && match[1]) {
        scrapedYoutubeId = match[1];
      }
    } catch (e) {}
  }

  return res.json({
    stationId: stationId,
    name: station.name,
    dial: station.dial,
    city: station.city,
    youtubeId: scrapedYoutubeId,
    directUrls: station.directUrls,
    proxyUrl: `/api/stream-proxy?id=${stationId}&t=${Date.now()}`
  });
});

// SSE (Server-Sent Events) para recibir comandos de Roblox
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

// Endpoint de control desde Roblox Studio
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
