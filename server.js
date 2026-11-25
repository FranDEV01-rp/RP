const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MASTER_KEY = "CarDashSeguro2026";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sseClients = new Map();

// DIAL ARGENTINO OFICIAL CON ENLACES HTTPS VERIFICADOS
const STATIONS = {
  // 1. ASPEN (La que ya te funcionaba)
  "caba_aspen": {
    name: "Aspen 102.3",
    dial: "102.3 FM",
    city: "Buenos Aires",
    streams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/ASPEN_SC"
    ]
  },
  // 2. URBANA PLAY 104.3 (Enlace oficial directo de audio, sin videos de YouTube)
  "caba_urbanaplay": {
    name: "Urbana Play 104.3",
    dial: "104.3 FM",
    city: "Buenos Aires",
    streams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/URBANAPLAY_SC",
      "https://urbanaplay.stream.mediasector.es/urbanaplay-ba.mp3",
      "https://stream.zeno.fm/f8y0u69u21zuv"
    ]
  },
  // 3. FM VIDA ROSARIO 97.9 (CDN HTTPS verificado de Rosario)
  "ros_vida": {
    name: "FM Vida Rosario 97.9",
    dial: "97.9 FM",
    city: "Rosario, Santa Fe",
    streams: [
      "https://stream.zeno.fm/9uvrtub5puzuv",
      "https://streaming.rosario3.com/fmvida/live/playlist.m3u8",
      "https://stream.zeno.fm/s4k8yv405qzuv"
    ]
  },
  // 4. FM 100.3 ROSARIO (Boing)
  "ros_1003": {
    name: "FM 100.3 Rosario (Boing)",
    dial: "100.3 FM",
    city: "Rosario, Santa Fe",
    streams: [
      "https://stream.zeno.fm/6y2x37n5t7zuv",
      "https://streaming.redboing.com/boing"
    ]
  },
  // 5. LA 100 99.9 (Enlace oficial StreamTheWorld, igual a Aspen)
  "caba_la100": {
    name: "La 100 99.9",
    dial: "99.9 FM",
    city: "Buenos Aires",
    streams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/LA_100_SC"
    ]
  },
  // 6. RADIO MITRE AM 790 (StreamTheWorld)
  "caba_mitre": {
    name: "Radio Mitre AM 790",
    dial: "790 AM",
    city: "Buenos Aires",
    streams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/MITRE_AM790_SC"
    ]
  },
  // 7. LOS 40 ARGENTINA 105.5 (StreamTheWorld)
  "caba_los40": {
    name: "Los 40 105.5",
    dial: "105.5 FM",
    city: "Buenos Aires",
    streams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_ARGENTINA_SC"
    ]
  },
  // 8. RADIO DISNEY 94.3 (StreamTheWorld)
  "caba_disney": {
    name: "Radio Disney 94.3",
    dial: "94.3 FM",
    city: "Buenos Aires",
    streams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/DISNEY_ARG_SC"
    ]
  },
  // 9. CADENA 3 ARGENTINA (Córdoba / Nacional - StreamTheWorld)
  "cba_cadena3": {
    name: "Cadena 3 100.9",
    dial: "100.9 FM / 700 AM",
    city: "Córdoba",
    streams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/CADENA3_SC"
    ]
  },
  // 10. RADIO CONTINENTAL AM 590 (StreamTheWorld)
  "caba_continental": {
    name: "Radio Continental AM 590",
    dial: "590 AM",
    city: "Buenos Aires",
    streams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/CONTINENTAL_SC"
    ]
  },
  // 11. RADIO RIVADAVIA AM 630 (StreamTheWorld)
  "caba_rivadavia": {
    name: "Radio Rivadavia AM 630",
    dial: "630 AM",
    city: "Buenos Aires",
    streams: [
      "https://playerservices.streamtheworld.com/api/livestream-redirect/RIVADAVIA_SC"
    ]
  },
  // 12. POP RADIO 101.5 (Indalo CDN)
  "caba_pop": {
    name: "Pop Radio 101.5",
    dial: "101.5 FM",
    city: "Buenos Aires",
    streams: [
      "https://pop.streamindalo.com.ar/pop.mp3"
    ]
  },
  // 13. MEGA 98.3 (Puro Rock Nacional)
  "caba_mega": {
    name: "Mega 98.3",
    dial: "98.3 FM",
    city: "Buenos Aires",
    streams: [
      "https://mega.streamindalo.com.ar/mega.mp3"
    ]
  },
  // 14. RADIO VALE 97.5 (Indalo CDN)
  "caba_vale": {
    name: "Radio Vale 97.5",
    dial: "97.5 FM",
    city: "Buenos Aires",
    streams: [
      "https://vale.streamindalo.com.ar/vale.mp3"
    ]
  },
  // 15. RADIO 10 AM 710 (Indalo CDN)
  "caba_radio10": {
    name: "Radio 10 AM 710",
    dial: "710 AM",
    city: "Buenos Aires",
    streams: [
      "https://radio10.streamindalo.com.ar/radio10.mp3"
    ]
  }
};

// Endpoint que devuelve los enlaces directos de la emisora
app.get('/api/station-info', (req, res) => {
  const station = STATIONS[req.query.id];
  if (!station) return res.status(404).json({ error: "No encontrada" });

  res.json({
    stationId: req.query.id,
    name: station.name,
    dial: station.dial,
    city: station.city,
    streams: station.streams
  });
});

// SSE para sincronizar con el navegador del conductor
app.get('/events', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).send("Falta userId");

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  sseClients.set(String(userId), res);

  const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(String(userId));
  });
});

// Control remoto desde Roblox
app.post('/api/control', (req, res) => {
  if (req.headers['x-auth-token'] !== MASTER_KEY) return res.status(403).json({ error: "No autorizado" });
  const { userId, system, action, data } = req.body;
  if (!userId || !system || !action) return res.status(400).json({ error: "Faltan datos" });

  const client = sseClients.get(String(userId));
  if (client) client.write(`data: ${JSON.stringify({ system, action, data })}\n\n`);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Receptor listo en puerto ${PORT}`);
});
