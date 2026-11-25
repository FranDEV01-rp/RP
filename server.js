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

// Clientes SSE conectados por UserId
const sseClients = new Map();

// Base de datos de emisoras con cadenas de servidores HTTPS verificados y canales oficiales
const STATIONS_DB = {
  "caba_urbanaplay": {
    name: "Urbana Play 104.3",
    dial: "104.3 FM",
    city: "Buenos Aires",
    scrapeUrl: "https://urbanaplayfm.com/radio/",
    ytChannel: "@UrbanaPlayFM",
    fallbackStreams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/URBANAPLAY_SC",
      "https://icecast.urbanaplayfm.com/urbanaplay.mp3",
      "https://stream.zeno.fm/f8y0u69u21zuv"
    ]
  },
  "ros_vida": {
    name: "FM Vida Rosario 97.9",
    dial: "97.9 FM",
    city: "Rosario, Santa Fe",
    scrapeUrl: "https://www.rosario3.com/radios/fmvida.html",
    ytChannel: "@fmvida979",
    fallbackStreams: [
      "https://stream.zeno.fm/9uvrtub5puzuv",
      "https://audio.fmvida.com.ar/stream",
      "https://live.fmvida.com.ar/stream"
    ]
  },
  "ros_1003": {
    name: "FM 100.3 Rosario",
    dial: "100.3 FM",
    city: "Rosario, Santa Fe",
    scrapeUrl: null,
    ytChannel: null,
    fallbackStreams: [
      "https://stream.zeno.fm/6y2x37n5t7zuv",
      "https://stream.boing973.com/boing"
    ]
  },
  "caba_aspen": {
    name: "Aspen 102.3",
    dial: "102.3 FM",
    city: "Buenos Aires",
    scrapeUrl: null,
    ytChannel: null,
    fallbackStreams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/ASPEN_SC",
      "https://edge.audio.aspen1023.com.ar/aspen.mp3"
    ]
  },
  "caba_la100": {
    name: "La 100 99.9",
    dial: "99.9 FM",
    city: "Buenos Aires",
    scrapeUrl: null,
    ytChannel: null,
    fallbackStreams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/LA_100_SC",
      "https://stream.cienradios.com/la100.mp3"
    ]
  },
  "caba_mitre": {
    name: "Radio Mitre AM 790",
    dial: "790 AM",
    city: "Buenos Aires",
    scrapeUrl: null,
    ytChannel: null,
    fallbackStreams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/MITRE_AM790_SC",
      "https://stream.cienradios.com/mitremp3.mp3"
    ]
  },
  "caba_pop": {
    name: "Pop Radio 101.5",
    dial: "101.5 FM",
    city: "Buenos Aires",
    scrapeUrl: null,
    ytChannel: null,
    fallbackStreams: [
      "https://pop.streamindalo.com.ar/pop.mp3",
      "https://stream.indalo.com.ar/pop.mp3"
    ]
  },
  "caba_mega": {
    name: "Mega 98.3",
    dial: "98.3 FM",
    city: "Buenos Aires",
    scrapeUrl: null,
    ytChannel: null,
    fallbackStreams: [
      "https://mega.streamindalo.com.ar/mega.mp3",
      "https://stream.indalo.com.ar/mega.mp3"
    ]
  },
  "caba_los40": {
    name: "Los 40 105.5",
    dial: "105.5 FM",
    city: "Buenos Aires",
    scrapeUrl: null,
    ytChannel: null,
    fallbackStreams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_ARGENTINA_SC"
    ]
  },
  "caba_disney": {
    name: "Radio Disney 94.3",
    dial: "94.3 FM",
    city: "Buenos Aires",
    scrapeUrl: null,
    ytChannel: null,
    fallbackStreams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/DISNEY_ARG_SC"
    ]
  },
  "cba_cadena3": {
    name: "Cadena 3 100.9",
    dial: "100.9 FM / 700 AM",
    city: "Córdoba",
    scrapeUrl: null,
    ytChannel: null,
    fallbackStreams: [
      "https://cadena3.streamguys1.com/cadena3",
      "https://playerservices.streamtheworld.com/api/livestream-redirect/CADENA3_SC"
    ]
  }
};

// Función auxiliar para realizar peticiones HTTP/HTTPS con encabezados de navegador real
function fetchHtml(targetUrl, timeoutMs = 2800) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-419,es;q=0.9,en;q=0.8'
      },
      timeout: timeoutMs
    };

    const req = client.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, targetUrl).href;
        }
        return resolve(fetchHtml(redirectUrl, timeoutMs));
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
    req.end();
  });
}

// Resuelve dinámicamente el ID de YouTube Live o enlaces M3U8
async function resolveDynamicSources(stationConfig) {
  let resolvedYtId = null;
  let dynamicAudioUrls = [];

  // 1. Scraping del canal de YouTube si está configurado
  if (stationConfig.ytChannel) {
    try {
      const ytLiveUrl = `https://www.youtube.com/${stationConfig.ytChannel}/live`;
      const html = await fetchHtml(ytLiveUrl, 2600);
      const videoIdMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})">/);
      
      if (videoIdMatch && videoIdMatch[1]) {
        resolvedYtId = videoIdMatch[1];
      } else if (canonicalMatch && canonicalMatch[1]) {
        resolvedYtId = canonicalMatch[1];
      }
    } catch (e) {
      // Continuar silenciosamente hacia la siguiente fuente
    }
  }

  // 2. Scraping del sitio web oficial de la radio (ej: Urbana Play)
  if (stationConfig.scrapeUrl) {
    try {
      const pageHtml = await fetchHtml(stationConfig.scrapeUrl, 2600);
      
      // Búsqueda de iframe de YouTube incrustado en el sitio oficial
      const ytEmbedMatch = pageHtml.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
      if (ytEmbedMatch && ytEmbedMatch[1] && !resolvedYtId) {
        resolvedYtId = ytEmbedMatch[1];
      }

      // Búsqueda de streams HLS o MP3 directos en el código
      const m3u8Matches = pageHtml.match(/https?:\/\/[^\s"'<>]+\.(m3u8|mp3)[^\s"'<>]*/gi);
      if (m3u8Matches && m3u8Matches.length > 0) {
        m3u8Matches.forEach(url => {
          if (!dynamicAudioUrls.includes(url)) {
            dynamicAudioUrls.push(url);
          }
        });
      }
    } catch (e) {
      // Continuar con los streams de respaldo
    }
  }

  const combinedStreams = [...dynamicAudioUrls, ...stationConfig.fallbackStreams];
  return {
    youtubeLiveId: resolvedYtId,
    streams: combinedStreams
  };
}

// Endpoint de resolución de emisoras
app.get('/api/resolve-station', async (req, res) => {
  const stationId = req.query.id;
  const config = STATIONS_DB[stationId];

  if (!config) {
    return res.status(404).json({ error: "Emisora no encontrada" });
  }

  try {
    const dynamicData = await resolveDynamicSources(config);
    return res.json({
      success: true,
      stationId: stationId,
      name: config.name,
      dial: config.dial,
      city: config.city,
      youtubeLiveId: dynamicData.youtubeLiveId,
      streams: dynamicData.streams
    });
  } catch (err) {
    return res.json({
      success: true,
      stationId: stationId,
      name: config.name,
      dial: config.dial,
      city: config.city,
      youtubeLiveId: null,
      streams: config.fallbackStreams
    });
  }
});

// SSE (Server-Sent Events) para sincronizar en tiempo real con el navegador
app.get('/events', (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).send("Falta userId");
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  sseClients.set(userId, res);

  // Heartbeat cada 25 segundos
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(userId);
  });
});

// Endpoint de control desde Roblox
app.post('/api/control', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token !== MASTER_KEY) {
    return res.status(403).json({ error: "No autorizado" });
  }

  const { userId, system, action, data } = req.body;
  if (!userId || !system || !action) {
    return res.status(400).json({ error: "Parámetros incompletos" });
  }

  const client = sseClients.get(String(userId));
  if (client) {
    const payload = JSON.stringify({ system, action, data });
    client.write(`data: ${payload}\n\n`);
  }

  return res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Receptor Maestro ejecutándose en puerto ${PORT}`);
});
