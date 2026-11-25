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

// Base de datos de emisoras con cadenas de respaldo HTTPS verificadas
const STATIONS_CONFIG = {
  "caba_urbanaplay": {
    name: "Urbana Play 104.3",
    dial: "104.3 FM",
    city: "Buenos Aires",
    ytQuery: "Urbana Play 104.3 en vivo",
    channelHandle: "@UrbanaPlayFM",
    officialWeb: "https://urbanaplayfm.com/radio/",
    audioStreams: [
      "https://stream.zeno.fm/f8y0u69u21zuv",
      "https://playerservices.streamtheworld.com/api/livestream-redirect/URBANAPLAYAAC.aac"
    ]
  },
  "ros_vida": {
    name: "FM Vida Rosario 97.9",
    dial: "97.9 FM",
    city: "Rosario, Santa Fe",
    ytQuery: "FM Vida 97.9 Rosario en vivo",
    channelHandle: "@fmvida979",
    officialWeb: "https://www.rosario3.com/radios/fmvida.html",
    audioStreams: [
      "https://stream.rosario3.com/fmvida.mp3",
      "https://streaming.rosario3.com/fmvida/live/playlist.m3u8",
      "https://edge01.inliveserver.com:1936/fmvida/fmvida/playlist.m3u8",
      "https://stream.zeno.fm/9uvrtub5puzuv"
    ]
  },
  "ros_1003": {
    name: "FM 100.3 Rosario",
    dial: "100.3 FM",
    city: "Rosario, Santa Fe",
    ytQuery: "FM 100.3 Rosario en vivo",
    channelHandle: null,
    officialWeb: null,
    audioStreams: [
      "https://stream.zeno.fm/6y2x37n5t7zuv",
      "https://stream.boing973.com/boing"
    ]
  },
  "caba_aspen": {
    name: "Aspen 102.3",
    dial: "102.3 FM",
    city: "Buenos Aires",
    ytQuery: null,
    channelHandle: null,
    officialWeb: null,
    audioStreams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/ASPEN_SC",
      "https://edge.audio.aspen1023.com.ar/aspen.mp3"
    ]
  },
  "caba_la100": {
    name: "La 100 99.9",
    dial: "99.9 FM",
    city: "Buenos Aires",
    ytQuery: "La 100 en vivo 99.9",
    channelHandle: "@la100",
    officialWeb: null,
    audioStreams: [
      "https://stream.cienradios.com/la100.mp3",
      "https://playerservices.streamtheworld.com/api/livestream-redirect/LA_100_SC"
    ]
  },
  "caba_mitre": {
    name: "Radio Mitre AM 790",
    dial: "790 AM",
    city: "Buenos Aires",
    ytQuery: "Radio Mitre AM 790 en vivo",
    channelHandle: "@radiomitre",
    officialWeb: null,
    audioStreams: [
      "https://stream.cienradios.com/mitremp3.mp3",
      "https://playerservices.streamtheworld.com/api/livestream-redirect/MITRE_AM790_SC"
    ]
  },
  "caba_pop": {
    name: "Pop Radio 101.5",
    dial: "101.5 FM",
    city: "Buenos Aires",
    ytQuery: null,
    channelHandle: null,
    officialWeb: null,
    audioStreams: [
      "https://pop.streamindalo.com.ar/pop.mp3"
    ]
  },
  "caba_mega": {
    name: "Mega 98.3",
    dial: "98.3 FM",
    city: "Buenos Aires",
    ytQuery: null,
    channelHandle: null,
    officialWeb: null,
    audioStreams: [
      "https://mega.streamindalo.com.ar/mega.mp3"
    ]
  },
  "caba_los40": {
    name: "Los 40 105.5",
    dial: "105.5 FM",
    city: "Buenos Aires",
    ytQuery: null,
    channelHandle: null,
    officialWeb: null,
    audioStreams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_ARGENTINA_SC"
    ]
  },
  "caba_disney": {
    name: "Radio Disney 94.3",
    dial: "94.3 FM",
    city: "Buenos Aires",
    ytQuery: null,
    channelHandle: null,
    officialWeb: null,
    audioStreams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/DISNEY_ARG_SC"
    ]
  },
  "cba_cadena3": {
    name: "Cadena 3 100.9",
    dial: "100.9 FM / 700 AM",
    city: "Córdoba",
    ytQuery: null,
    channelHandle: null,
    officialWeb: null,
    audioStreams: [
      "https://cadena3.streamguys1.com/cadena3"
    ]
  }
};

// Cliente HTTP para consultar sitios web simulando navegador
function httpGet(targetUrl, timeoutMs = 2800) {
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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9'
        },
        timeout: timeoutMs
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let redir = res.headers.location;
          if (!redir.startsWith('http')) redir = new URL(redir, targetUrl).href;
          return resolve(httpGet(redir, timeoutMs));
        }
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

// Búsqueda profunda de transmisiones en vivo
async function searchLiveBroadcast(station) {
  let liveVideoId = null;
  let dynamicAudioList = [];

  // 1. Buscar en la web oficial si existe (ej. urbanaplayfm.com)
  if (station.officialWeb) {
    try {
      const webHtml = await httpGet(station.officialWeb, 2500);
      const embedMatch = webHtml.match(/(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (embedMatch && embedMatch[1]) {
        liveVideoId = embedMatch[1];
      }
      const streamMatches = webHtml.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp3)[^\s"'<>]*/gi);
      if (streamMatches) {
        streamMatches.forEach(url => {
          if (!dynamicAudioList.includes(url)) dynamicAudioList.push(url);
        });
      }
    } catch (e) {
      // Continuar con la siguiente fuente
    }
  }

  // 2. Si no hay ID, buscar directamente en YouTube filtrando por "EN DIRECTO / EN VIVO" (sp=EgJAAQ%253D%253D)
  if (!liveVideoId && station.ytQuery) {
    try {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(station.ytQuery)}&sp=EgJAAQ%253D%253D`;
      const searchHtml = await httpGet(searchUrl, 2500);
      
      // Buscar videoId que tenga indicador de directo activo
      const liveIdMatch = searchHtml.match(/"videoId":"([a-zA-Z0-9_-]{11})"(?:(?!<\/script>).)*?"style":"BADGE_STYLE_TYPE_LIVE_NOW"/s);
      if (liveIdMatch && liveIdMatch[1]) {
        liveVideoId = liveIdMatch[1];
      } else {
        // Coincidencia estándar de videoId en resultados de búsqueda
        const genericMatch = searchHtml.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (genericMatch && genericMatch[1]) {
          liveVideoId = genericMatch[1];
        }
      }
    } catch (e) {
      // Continuar con los streams de audio
    }
  }

  return {
    liveVideoId: liveVideoId,
    streams: [...dynamicAudioList, ...station.audioStreams]
  };
}

// Endpoint de resolución de emisora (llamado durante los 5 segundos de estática)
app.get('/api/resolve-station', async (req, res) => {
  const stationId = req.query.id;
  const station = STATIONS_CONFIG[stationId];

  if (!station) {
    return res.status(404).json({ error: "Emisora no registrada" });
  }

  try {
    const result = await searchLiveBroadcast(station);
    return res.json({
      success: true,
      stationId: stationId,
      name: station.name,
      dial: station.dial,
      city: station.city,
      youtubeId: result.liveVideoId,
      streams: result.streams
    });
  } catch (err) {
    return res.json({
      success: true,
      stationId: stationId,
      name: station.name,
      dial: station.dial,
      city: station.city,
      youtubeId: null,
      streams: station.audioStreams
    });
  }
});

// SSE para comandos en tiempo real
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

// Control remoto desde Roblox
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
  console.log(`Servidor de Control ejecutándose en puerto ${PORT}`);
});
