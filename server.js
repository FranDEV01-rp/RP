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

app.post('/api/control', (req, res) => {
  if (req.headers['x-auth-token'] !== MASTER_KEY) {
    return res.status(403).json({ error: "No autorizado" });
  }

  const { userId, action, data } = req.body;
  if (!userId || !action) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  const client = sseClients.get(String(userId));
  if (client) {
    client.write(`data: ${JSON.stringify({ action, data })}\n\n`);
  }

  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`CarDash Server activo en puerto ${PORT}`);
});
