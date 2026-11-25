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

// CANALES Y PÁGINAS OFICIALES PARA BÚSQUEDA DINÁMICA
const ESTACIONES_CONFIG = {
  caba_urbanaplay: {
    name: "Urbana Play 104.3",
    pageUrl: "https://urbanaplayfm.com/radio/",
    ytChannel: "UrbanaPlayFM",
    fallback: "https://playerservices.streamtheworld.com/api/livestream-redirect/URBANAPLAY_SC.mp3"
  },
  ros_vida: {
    name: "FM Vida Rosario 97.9",
    pageUrl: "https://www.rosario3.com/radios/fmvida/",
    ytChannel: "fmvida979",
    query: "FM Vida",
    fallback: "https://stream.zeno.fm/f8y0u69u21zuv"
  },
  caba_aspen: {
    name: "Aspen 102.3",
    fallback: "https://playerservices.streamtheworld.com/api/livestream-redirect/ASPEN.mp3"
  },
  caba_la100: {
    name: "La 100 99.9",
    ytChannel: "La100",
    fallback: "https://playerservices.streamtheworld.com/api/livestream-redirect/LA100.mp3"
  },
  caba_mega: {
    name: "Mega 98.3 Puro Rock",
    ytChannel: "mega983",
    fallback: "https://stream.indalo.com.ar/mega.mp3"
  },
  caba_pop: {
    name: "Pop Radio 101.5",
    fallback: "https://stream.indalo.com.ar/pop.mp3"
  },
  cba_cadena3: {
    name: "Cadena 3 Córdoba",
    ytChannel: "Cadena3Argentina",
    fallback: "https://streaming.cadena3.com/cadena3.mp3"
  },
  caba_mitre: {
    name: "Radio Mitre AM 790",
    ytChannel: "radiomitre",
    fallback: "https://stream.cienradios.com/mitre.mp3"
  }
};

const playerStates = {};

function getOrCreatePlayer(userId) {
  if (!playerStates[userId]) {
    playerStates[userId] = {
      activeSystem: 'none',
      cardash: { videoId: '', isPlaying: false, volume: 100, loop: false },
      radio: { stationId: 'caba_urbanaplay', isPlaying: false, volume: 100 }
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

// BUSCADOR EN VIVO: Extrae el YouTube Live activo de un canal
function findYouTubeLiveId(channelHandle) {
  return new Promise((resolve) => {
    if (!channelHandle) return resolve(null);
    const target = `https://www.youtube.com/@${channelHandle}/live`;

    https.get(target, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      // Si redirige al video en vivo (código 302 o 303)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const match = res.headers.location.match(/watch\?v=([\w-]{11})/);
        if (match) return resolve(match[1]);
      }

      let data = '';
      res.on('data', chunk => {
        data += chunk;
        if (data.length > 50000) res.destroy(); // Primeros 50KB bastan
      });
      res.on('close', () => {
        const match = data.match(/\"videoId\":\"([\w-]{11})\"/) || data.match(/href=\"\/watch\?v=([\w-]{11})\"/);
        resolve(match ? match[1] : null);
      });
    }).on('error', () => resolve(null));
  });
}

// BUSCADOR EN VIVO: Lee la página oficial de la radio (ej: urbanaplayfm.com/radio)
function scrapeRadioPage(pageUrl) {
  return new Promise((resolve) => {
    if (!pageUrl) return resolve(null);

    https.get(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
        if (data.length > 80000) res.destroy();
      });
      res.on('close', () => {
        // Busca enlace .m3u8, .mp3 o embed de YouTube dentro de su web
        const m3u8Match = data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
        if (m3u8Match) return resolve({ type: 'hls', url: m3u8Match[1] });

        const ytMatch = data.match(/youtube\.com\/(?:embed\/|live\/)([\w-]{11})/i);
        if (ytMatch) return resolve({ type: 'youtube', id: ytMatch[1] });

        const mp3Match = data.match(/(https?:\/\/[^\s"'<>]+\.mp3[^\s"'<>]*)/i);
        if (mp3Match) return resolve({ type: 'audio', url: mp3Match[1] });

        resolve(null);
      });
    }).on('error', () => resolve(null));
  });
}

// ENDPOINT DEL BUSCADOR: Se ejecuta durante los 5 segundos de estática
app.get('/api/resolve-radio/:stationId', async (req, res) => {
  const cfg = ESTACIONES_CONFIG[req.params.stationId] || ESTACIONES_CONFIG.caba_urbanaplay;

  try {
    // 1. Escanear la página oficial de la radio si existe
    if (cfg.pageUrl) {
      const pageResult = await scrapeRadioPage(cfg.pageUrl);
      if (pageResult) {
        return res.json({ success: true, ...pageResult, source: "Página Oficial en Vivo" });
      }
    }

    // 2. Si tiene canal de YouTube, buscar si está en vivo AHORA
    if (cfg.ytChannel) {
      const liveYtId = await findYouTubeLiveId(cfg.ytChannel);
      if (liveYtId) {
        return res.json({ success: true, type: 'youtube', id: liveYtId, source: "YouTube Live Oficial (Solo Audio)" });
      }
    }

    // 3. Fallback oficial directo
    return res.json({ success: true, type: 'audio', url: cfg.fallback, source: "Señal Directa Verificada" });

  } catch (err) {
    return res.json({ success: true, type: 'audio', url: cfg.fallback, source: "Fallback" });
  }
});

// Control desde Roblox
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
      p.radio.stationId = String(data || "caba_urbanaplay");
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

app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});
