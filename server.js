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

// STREAMS DE PUENTE
const RADIO_STREAMS = {
  ros_vida: "https://stream.zeno.fm/f8y0u69u21zuv",
  caba_aspen: "https://playerservices.streamtheworld.com/api/livestream-redirect/ASPEN.mp3",
  caba_la100: "https://playerservices.streamtheworld.com/api/livestream-redirect/LA100.mp3",
  caba_mega: "https://stream.zeno.fm/2sqqg54117zuv",
  caba_pop: "https://stream.zeno.fm/0tqqg54117zuv",
  cba_cadena3: "https://streaming.cadena3.com/cadena3.mp3"
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

// Proxy seguro de audio
app.get('/api/radio-stream/:stationId', (req, res) => {
  const targetUrl = RADIO_STREAMS[req.params.stationId] || RADIO_STREAMS.ros_vida;
  try {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    client.get(targetUrl, {
      headers: { 'User-Agent': 'VLC/3.0.18' }
    }, (streamRes) => {
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Access-Control-Allow-Origin': '*'
      });
      streamRes.pipe(res);
    }).on('error', () => {
      if (!res.headersSent) res.status(502).end();
    });
  } catch (err) {
    if (!res.headersSent) res.status(500).end();
  }
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});
