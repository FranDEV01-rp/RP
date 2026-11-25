const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MASTER_KEY = "CarDashSeguro2026";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// STREAMS OFICIALES DE RADIOS ARGENTINAS
const RADIO_STREAMS = {
  // CABA
  caba_aspen: "https://playerservices.streamtheworld.com/api/livestream-redirect/ASPEN.mp3",
  caba_la100: "https://stream.cienradios.com/la100.mp3",
  caba_urbanaplay: "https://edge03.inmystream.info:20188/stream",
  caba_mega: "https://stream.indalo.com.ar/mega.mp3",
  caba_rockpop: "https://stream.rockandpop.com.ar/rockandpop.mp3",
  caba_los40: "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_ARG_SC",
  caba_disney: "https://playerservices.streamtheworld.com/api/livestream-redirect/DISNEY_ARG_SC",
  caba_pop: "https://stream.indalo.com.ar/pop.mp3",
  caba_one: "https://stream.indalo.com.ar/one.mp3",
  caba_convos: "https://streaming.radioconvos.com.ar/stream",
  caba_vorterix: "https://edge01.inmystream.info:20020/stream",
  caba_metro: "https://edge03.inmystream.info:20106/stream",
  caba_blue: "https://edge03.inmystream.info:20104/stream",
  
  // ROSARIO
  ros_vida: "https://edge01.inmystream.info:20042/stream",
  ros_1003: "https://edge01.inmystream.info:20044/stream",
  ros_lared: "https://edge01.inmystream.info:20046/stream",
  ros_mitre: "https://stream.cienradios.com/mitre.mp3",
  ros_nacional: "https://stream.radionacional.com.ar/lra1",

  // CÓRDOBA & INTERIOR
  cba_cadena3: "https://streaming.cadena3.com/cadena3.mp3",
  cba_uno: "https://edge01.inmystream.info:20048/stream",
  cba_lv3: "https://streaming.cadena3.com/cadena3.mp3",
  cba_mitre: "https://stream.cienradios.com/mitre.mp3",

  // AM DE RUTA
  am_continental: "https://edge01.inmystream.info:20012/stream",
  am_rivadavia: "https://edge01.inmystream.info:20014/stream",
  am_radio10: "https://stream.indalo.com.ar/radio10.mp3",
  am_nacional: "https://stream.radionacional.com.ar/lra1"
};

// Estado en memoria por cada jugador de Roblox
const playerStates = {};

function getOrCreatePlayer(userId) {
  if (!playerStates[userId]) {
    playerStates[userId] = {
      activeSystem: 'none', // 'cardash' | 'radio' | 'none'
      cardash: {
        videoId: '',
        isPlaying: false,
        volume: 100,
        loop: false,
        updatedAt: Date.now()
      },
      radio: {
        stationId: 'ros_vida',
        isPlaying: false,
        volume: 100,
        updatedAt: Date.now()
      }
    };
  }
  return playerStates[userId];
}

// Endpoint para que Roblox mande órdenes (CarDash o Radio)
app.post('/api/control', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token !== MASTER_KEY) {
    return res.status(403).json({ error: "Acceso denegado. Token invalido." });
  }

  const { userId, system, action, data } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Falta userId" });
  }

  const p = getOrCreatePlayer(userId);
  const sys = system === "radio" ? "radio" : "cardash";

  if (sys === "cardash") {
    if (action === "play") {
      p.cardash.videoId = String(data);
      p.cardash.isPlaying = true;
      p.activeSystem = "cardash";
      p.radio.isPlaying = false; // Apaga radio si arranca CarDash
    } else if (action === "pause") {
      p.cardash.isPlaying = false;
    } else if (action === "volume") {
      p.cardash.volume = Math.max(0, Math.min(100, parseInt(data, 10) || 0));
    } else if (action === "loop") {
      p.cardash.loop = (data === "true" || data === true);
    }
    p.cardash.updatedAt = Date.now();
  } 
  else if (sys === "radio") {
    if (action === "play") {
      p.radio.stationId = String(data);
      p.radio.isPlaying = true;
      p.activeSystem = "radio";
      p.cardash.isPlaying = false; // Apaga CarDash si arranca Radio
    } else if (action === "pause") {
      p.radio.isPlaying = false;
    } else if (action === "volume") {
      p.radio.volume = Math.max(0, Math.min(100, parseInt(data, 10) || 0));
    }
    p.radio.updatedAt = Date.now();
  }

  return res.json({ success: true, state: p });
});

// Endpoint para que la Web consulte el estado
app.get('/api/status/:userId', (req, res) => {
  const p = getOrCreatePlayer(req.params.userId);
  return res.json(p);
});

// Proxy seguro de audio para emisoras (Garantiza HTTPS sin bloqueos CORS)
app.get('/api/radio-stream/:stationId', (req, res) => {
  const stationId = req.params.stationId;
  const targetUrl = RADIO_STREAMS[stationId] || RADIO_STREAMS.ros_vida;

  const client = targetUrl.startsWith('https') ? https : http;
  
  client.get(targetUrl, (streamRes) => {
    res.writeHead(streamRes.statusCode, {
      'Content-Type': streamRes.headers['content-type'] || 'audio/mpeg',
      'Access-Control-Allow-Origin': '*'
    });
    streamRes.pipe(res);
  }).on('error', (err) => {
    res.status(500).end("Error conectando a la radio");
  });
});

app.listen(PORT, () => {
  console.log(`Servidor Dual CarDash + Radio FM corriendo en puerto ${PORT}`);
});
