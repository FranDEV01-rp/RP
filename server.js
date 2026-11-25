const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MASTER_KEY = "CarDashSeguro2026";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// STREAMS OFICIALES DE ARGENTINA (Con servidores de respaldo)
const RADIO_STREAMS = {
  // ROSARIO
  ros_vida: [
    "http://streaming.televisonlitoral.com:8000/fmvida.mp3",
    "https://stream.zeno.fm/f8y0u69u21zuv"
  ],
  ros_radio2: [
    "http://streaming.televisonlitoral.com:8000/radio2.mp3"
  ],

  // CABA & NACIONAL
  caba_aspen: [
    "https://playerservices.streamtheworld.com/api/livestream-redirect/ASPEN.mp3"
  ],
  caba_la100: [
    "https://stream.cienradios.com/la100.mp3",
    "https://playerservices.streamtheworld.com/api/livestream-redirect/LA100.mp3"
  ],
  caba_mega: [
    "https://stream.indalo.com.ar/mega.mp3"
  ],
  caba_pop: [
    "https://stream.indalo.com.ar/pop.mp3"
  ],
  caba_los40: [
    "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_ARG_SC.mp3"
  ],
  caba_disney: [
    "https://playerservices.streamtheworld.com/api/livestream-redirect/DISNEY_ARG_SC.mp3"
  ],
  caba_rockpop: [
    "https://stream.rockandpop.com.ar/rockandpop.mp3"
  ],
  caba_one: [
    "https://stream.indalo.com.ar/one.mp3"
  ],
  caba_urbanaplay: [
    "https://playerservices.streamtheworld.com/api/livestream-redirect/URBANAPLAY_SC.mp3"
  ],
  caba_vale: [
    "https://stream.indalo.com.ar/vale.mp3"
  ],

  // CÓRDOBA
  cba_cadena3: [
    "https://streaming.cadena3.com/cadena3.mp3"
  ],
  cba_lapopu: [
    "https://streaming.cadena3.com/lapopu.mp3"
  ],

  // AMs NACIONALES
  caba_mitre: [
    "https://stream.cienradios.com/mitre.mp3",
    "https://playerservices.streamtheworld.com/api/livestream-redirect/MITRE.mp3"
  ],
  caba_radio10: [
    "https://stream.indalo.com.ar/radio10.mp3"
  ],
  am_continental: [
    "https://playerservices.streamtheworld.com/api/livestream-redirect/CONTINENTAL.mp3"
  ],
  am_rivadavia: [
    "https://streaming01.reddelplata.com/rivadavia.mp3",
    "https://stream.zeno.fm/s4930d07r7zuv"
  ]
};

const playerStates = {};

function getOrCreatePlayer(userId) {
  if (!playerStates[userId]) {
    playerStates[userId] = {
      activeSystem: 'none',
      cardash: { videoId: '', isPlaying: false, volume: 100, loop: false },
      radio: { stationId: 'ros_vida', isPlaying: false, volume: 100 }
    };
  }
  return playerStates[userId];
}

function cleanYoutubeId(input) {
  if (!input) return "";
  const str = String(input).trim();
  const match = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : (str.length === 11 ? str : str);
}

app.post('/api/control', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token !== MASTER_KEY) return res.status(403).json({ error: "Token invalido" });

  const { userId, system, action, data } = req.body;
  if (!userId) return res.status(400).json({ error: "Falta userId" });

  const p = getOrCreatePlayer(userId);
  const sys = system === "radio" ? "radio" : "cardash";

  if (sys === "cardash") {
    if (action === "play") {
      const cleanId = cleanYoutubeId(data);
      if (cleanId) p.cardash.videoId = cleanId;
      p.cardash.isPlaying = true;
      p.activeSystem = "cardash";
      p.radio.isPlaying = false;
    } else if (action === "resume") {
      p.cardash.isPlaying = true;
      p.activeSystem = "cardash";
      p.radio.isPlaying = false;
    } else if (action === "pause") {
      p.cardash.isPlaying = false;
    } else if (action === "volume") {
      p.cardash.volume = Math.max(0, Math.min(100, parseInt(data, 10) || 0));
    }
  } else if (sys === "radio") {
    if (action === "play") {
      p.radio.stationId = String(data || "ros_vida");
      p.radio.isPlaying = true;
      p.activeSystem = "radio";
      p.cardash.isPlaying = false;
    } else if (action === "pause") {
      p.radio.isPlaying = false;
    } else if (action === "volume") {
      p.radio.volume = Math.max(0, Math.min(100, parseInt(data, 10) || 0));
    }
  }

  return res.json({ success: true, state: p });
});

app.get('/api/status/:userId', (req, res) => {
  return res.json(getOrCreatePlayer(req.params.userId));
});

// TÚNEL DE STREAMING BLINDADO: Se salta certificados rotos, puertos raros y bloqueos CORS
function pipeRadioStream(urlList, urlIdx, clientRes, maxRedirects = 4) {
  if (urlIdx >= urlList.length) {
    if (!clientRes.headersSent) clientRes.status(502).end("Emisora no disponible");
    return;
  }

  const targetUrl = urlList[urlIdx];
  try {
    const parsed = new URL(targetUrl);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;

    const reqOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
        'Accept': '*/*',
        'Icy-MetaData': '0'
      },
      rejectUnauthorized: false, // Ignora errores de certificados SSL viejos
      insecureHTTPParser: true   // Soporta servidores Shoutcast / Icecast de radio nacional
    };

    const proxyReq = client.request(reqOptions, (remoteRes) => {
      // Manejar redirecciones (301, 302, 307)
      if (remoteRes.statusCode >= 300 && remoteRes.statusCode < 400 && remoteRes.headers.location && maxRedirects > 0) {
        let redirectUrl = remoteRes.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, targetUrl).href;
        }
        return pipeRadioStream([redirectUrl], 0, clientRes, maxRedirects - 1);
      }

      clientRes.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store',
        'Connection': 'keep-alive'
      });

      remoteRes.pipe(clientRes);
    });

    proxyReq.on('error', () => {
      // Si la URL falla, prueba el enlace de respaldo
      pipeRadioStream(urlList, urlIdx + 1, clientRes, maxRedirects);
    });

    clientRes.on('close', () => {
      proxyReq.destroy();
    });

    proxyReq.end();
  } catch (err) {
    pipeRadioStream(urlList, urlIdx + 1, clientRes, maxRedirects);
  }
}

app.get('/api/radio-stream/:stationId', (req, res) => {
  const stationId = req.params.stationId;
  const urls = RADIO_STREAMS[stationId] || RADIO_STREAMS["ros_vida"];
  pipeRadioStream(urls, 0, res);
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});
