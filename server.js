const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

let clients = {};

app.post('/api/control', (req, res) => {
    const { userId, action, data } = req.body;
    console.log(`[Roblox -> Web] Usuario: ${userId} | Acción: ${action} | Datos: ${data}`);

    if (clients[userId]) {
        clients[userId].forEach(client => {
            client.res.write(`data: ${JSON.stringify({ action, data })}\n\n`);
        });
    }
    res.json({ success: true });
});

app.get('/api/stream/:userId', (req, res) => {
    const userId = req.params.userId;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Forzar el envío inmediato de datos para que Render no congele la conexión
    res.write('data: {"action":"conectado_exitoso"}\n\n');

    if (!clients[userId]) clients[userId] = [];
    const clientObj = { id: Date.now(), res };
    clients[userId].push(clientObj);

    // Mantener la conexión despierta cada 25 segundos
    const keepAlive = setInterval(() => {
        res.write(': ping\n\n');
    }, 25000);

    req.on('close', () => {
        clearInterval(keepAlive);
        clients[userId] = clients[userId].filter(c => c.id !== clientObj.id);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
