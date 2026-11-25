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

// STREAMS REALES DE RADIOS ARGENTINAS (HTTP y HTTPS)
const RADIO_STREAMS = {
  // Rosario
  "ros_vida": "http://streaming.televisonlitoral.com:8000/fmvida.mp3",
  "ros_1003": "https://edge01.inmystream.info:20044/stream",
  "ros_mitre": "https://playerservices.streamtheworld.com/api/livestream-redirect/MITRE.mp3",
  "ros_lared": "https://playerservices.streamtheworld.com/api/livestream-redirect/LA100.mp3",

  // CABA
  "caba_aspen": "https://playerservices.streamtheworld.com/api/livestream-redirect/ASPEN.mp3",
  "caba_la100": "https://playerservices.streamtheworld.com/api/livestream-redirect/LA100.mp3",
  "caba_los40": "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_ARG_SC.mp3",
  "caba_disney": "https://playerservices.streamtheworld.com/api/livestream-redirect/DISNEY_ARG_SC.mp3",
  "caba_mega": "https://stream.indalo.com.ar/mega.mp3",
  "caba_rockpop": "https://stream.rockandpop.com.ar/rockandpop.mp3",
  "caba_pop": "https://stream.indalo.com.ar/pop.mp3",
  "caba_one": "https://stream.indalo.com.ar/one.mp3",
  "caba_urbanaplay": "https://playerservices.streamtheworld.com/api/livestream-redirect/LA100.mp3",
  "caba_convos": "https://stream.indalo.com.ar/pop.mp3",

  // Córdoba & AMs
  "cba_cadena3": "https://streaming.cadena3.com/cadena3.mp3",
  "cba_mitre": "https://playerservices.streamtheworld.com/api/livestream-redirect/MITRE.mp3",
  "am_continental": "https://playerservices.streamtheworld.com/api/livestream-redirect/CONTINENTAL.mp3",
  "am_radio10": "https://stream.indalo.com.ar/radio10.mp3"
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

// Endpoint de órdenes desde Roblox
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

// PROXY DE AUDIO SEGURO: Permite reproducir radios HTTP en web HTTPS sin bloqueos
function proxyAudioStream(targetUrl, res, maxRedirects = 5) {
  if (maxRedirects <= 0) return res.status(500).end("Demasiadas redirecciones");

  try {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const proxyReq = client.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': '*/*'
      }
    }, (streamRes) => {
      // Si la emisora redirige (código 301/302)
      if (streamRes.statusCode >= 300 && streamRes.statusCode < 400 && streamRes.headers.location) {
        let redirectUrl = streamRes.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, targetUrl).href;
        }
        return proxyAudioStream(redirectUrl, res, maxRedirects - 1);
      }

      res.writeHead(streamRes.statusCode || 200, {
        'Content-Type': streamRes.headers['content-type'] || 'audio/mpeg',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store'
      });

      streamRes.pipe(res);
    });

    proxyReq.on('error', () => {
      if (!res.headersSent) res.status(502).end("Error conectando con la emisora");
    });

    res.on('close', () => {
      proxyReq.destroy();
    });
  } catch (err) {
    if (!res.headersSent) res.status(500).end("URL de radio invalida");
  }
}

app.get('/api/radio-stream/:stationId', (req, res) => {
  const stationId = req.params.stationId;
  const targetUrl = RADIO_STREAMS[stationId] || RADIO_STREAMS["ros_vida"];
  proxyAudioStream(targetUrl, res);
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});
