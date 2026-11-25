const express = require('express');
const cors = require('cors');
const path = require('path');
const net = require('net');
const tls = require('tls');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;
const MASTER_KEY = "CarDashSeguro2026";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sseClients = new Map();

// Catálogo verificado de emisoras argentinas
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
      "http://streaming.rosario3.com:8000/fmvida",
      "https://stream.zeno.fm/9uvrtub5puzuv"
    ]
  },
  "caba_urbanaplay": {
    name: "Urbana Play 104.3",
    dial: "104.3 FM",
    city: "Buenos Aires",
    urls: [
      "https://urbanaplay.stream.mediasector.es/urbanaplay-ba.mp3",
      "http://icecast.urbanaplayfm.com/urbanaplay.mp3",
      "https://stream.zeno.fm/f8y0u69u21zuv"
    ]
  },
  "ros_1003": {
    name: "FM 100.3 Rosario (Boing)",
    dial: "100.3 FM",
    city: "Rosario, Santa Fe",
    urls: [
      "http://stream.boing973.com/boing",
      "https://stream.zeno.fm/6y2x37n5t7zuv"
    ]
  },
  "caba_la100": {
    name: "La 100 99.9",
    dial: "99.9 FM",
    city: "Buenos Aires",
    urls: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/LA_100_SC"
    ]
  },
  "caba_mitre": {
    name: "Radio Mitre AM 790",
    dial: "790 AM",
    city: "Buenos Aires",
    urls: [
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
    dial: "100.9 FM",
    city: "Córdoba / Nacional",
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
      "https://pop.streamindalo.com.ar/pop.mp3"
    ]
  },
  "caba_mega": {
    name: "Mega 98.3",
    dial: "98.3 FM",
    city: "Buenos Aires",
    urls: [
      "https://mega.streamindalo.com.ar/mega.mp3"
    ]
  },
  "caba_continental": {
    name: "Radio Continental AM 590",
    dial: "590 AM",
    city: "Buenos Aires",
    urls: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/CONTINENTAL_SC"
    ]
  },
  "caba_rivadavia": {
    name: "Radio Rivadavia AM 630",
    dial: "630 AM",
    city: "Buenos Aires",
    urls: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/RIVADAVIA_SC"
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

app.get('/api/stations', (req, res) => {
  res.json(STATIONS);
});

// Transmisor universal de socket crudo (soporta Icecast, Shoutcast, HTTP y HTTPS sin cortes)
function streamRadioToClient(candidates, candidateIndex, req, res, hops = 0) {
  if (candidateIndex >= candidates.length || hops > 6) {
    if (!res.headersSent) {
      res.status(502).send("No se pudo conectar a los servidores de la emisora");
    }
    return;
  }

  const targetUrl = candidates[candidateIndex];
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (e) {
    return streamRadioToClient(candidates, candidateIndex + 1, req, res, 0);
  }

  const isHttps = parsed.protocol === 'https:';
  const port = Number(parsed.port) || (isHttps ? 443 : 80);
  const host = parsed.hostname;
  const path = (parsed.pathname || '/') + (parsed.search || '');

  const connector = isHttps ? tls : net;
  let socket = null;
  let headersParsed = false;
  let headerBuffer = Buffer.alloc(0);
  let isCleanedUp = false;

  function cleanupAndNext() {
    if (isCleanedUp) return;
    isCleanedUp = true;
    if (socket) {
      socket.removeAllListeners();
      socket.destroy();
    }
    if (!res.headersSent) {
      streamRadioToClient(candidates, candidateIndex + 1, req, res, 0);
    }
  }

  try {
    socket = connector.connect({
      host: host,
      port: port,
      servername: isHttps ? host : undefined,
      rejectUnauthorized: false
    }, () => {
      const hostHeader = (port === 80 || port === 443) ? host : `${host}:${port}`;
      const rawRequest = [
        `GET ${path} HTTP/1.1`,
        `Host: ${hostHeader}`,
        `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123.0.0.0`,
        `Accept: */*`,
        `Connection: close`,
        `\r\n`
      ].join('\r\n');
      socket.write(rawRequest);
    });
  } catch (err) {
    return cleanupAndNext();
  }

  // 8 segundos solo para el apretón de manos inicial
  socket.setTimeout(8000);
  socket.on('timeout', () => {
    cleanupAndNext();
  });

  socket.on('data', (chunk) => {
    if (!headersParsed) {
      headerBuffer = Buffer.concat([headerBuffer, chunk]);
      const headerEndIndex = headerBuffer.indexOf('\r\n\r\n');
      if (headerEndIndex !== -1) {
        headersParsed = true;

        // Desactivar timeout para que la transmisión sea infinita y jamás se corte
        socket.setTimeout(0);
        if (req.socket) req.socket.setTimeout(0);

        const headerStr = headerBuffer.slice(0, headerEndIndex).toString('latin1');
        const audioData = headerBuffer.slice(headerEndIndex + 4);

        // Si la emisora redirige (301, 302, 307), seguir el enlace
        const matchRedirect = headerStr.match(/Location:\s*([^\r\n]+)/i);
        if (matchRedirect && (headerStr.includes('301') || headerStr.includes('302') || headerStr.includes('307'))) {
          isCleanedUp = true;
          socket.destroy();
          let redirectUrl = matchRedirect[1].trim();
          if (!redirectUrl.startsWith('http')) {
            redirectUrl = new URL(redirectUrl, targetUrl).href;
          }
          return streamRadioToClient([redirectUrl, ...candidates.slice(candidateIndex + 1)], 0, req, res, hops + 1);
        }

        // Si devuelve error 404 o 500, probar el servidor de respaldo
        const firstLine = headerStr.split('\r\n')[0] || '';
        if (firstLine.includes('403') || firstLine.includes('404') || firstLine.includes('500')) {
          return cleanupAndNext();
        }

        let contentType = 'audio/mpeg';
        const matchCT = headerStr.match(/content-type:\s*([^\r\n]+)/i);
        if (matchCT) {
          contentType = matchCT[1].trim().split(';')[0];
        }

        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Connection': 'keep-alive'
        });

        if (audioData.length > 0) {
          res.write(audioData);
        }
      }
    } else {
      res.write(chunk);
    }
  });

  socket.on('error', () => {
    cleanupAndNext();
  });

  socket.on('end', () => {
    if (!res.headersSent) {
      cleanupAndNext();
    } else {
      res.end();
    }
  });

  req.on('close', () => {
    isCleanedUp = true;
    socket.destroy();
  });
}

// Punto de acceso seguro para el navegador
app.get('/api/radio-stream', (req, res) => {
  const stationId = req.query.id;
  const station = STATIONS[stationId];
  if (!station || !station.urls || station.urls.length === 0) {
    return res.status(404).send("Emisora no registrada");
  }
  streamRadioToClient(station.urls, 0, req, res, 0);
});

// Eventos SSE en tiempo real
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
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(String(userId));
  });
});

// Comandos desde Roblox
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

  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Receptor Maestro operativo en puerto ${PORT}`);
});
