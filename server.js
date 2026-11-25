const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MASTER_KEY = "CarDashSeguro2026";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Estado independiente por cada jugador
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

// Extrae el ID limpio de 11 caracteres de YouTube
function cleanYoutubeId(input) {
  if (!input) return "";
  const str = String(input).trim();
  const match = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : (str.length === 11 ? str : str);
}

// Endpoint de control desde Roblox
app.post('/api/control', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token !== MASTER_KEY) {
    return res.status(403).json({ error: "Token invalido" });
  }

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
      p.radio.isPlaying = false; // Apaga la radio si pones YouTube
    } else if (action === "resume") {
      p.cardash.isPlaying = true;
      p.activeSystem = "cardash";
      p.radio.isPlaying = false;
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
      p.radio.stationId = String(data || "ros_vida");
      p.radio.isPlaying = true;
      p.activeSystem = "radio";
      p.cardash.isPlaying = false; // Apaga YouTube si prendes la radio
    } else if (action === "resume") {
      p.radio.isPlaying = true;
      p.activeSystem = "radio";
      p.cardash.isPlaying = false;
    } else if (action === "pause") {
      p.radio.isPlaying = false;
    } else if (action === "volume") {
      p.radio.volume = Math.max(0, Math.min(100, parseInt(data, 10) || 0));
    }
    p.radio.updatedAt = Date.now();
  }

  return res.json({ success: true, state: p });
});

// Consulta de estado desde la web
app.get('/api/status/:userId', (req, res) => {
  return res.json(getOrCreatePlayer(req.params.userId));
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});
