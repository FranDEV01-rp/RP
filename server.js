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
    if (!clients[userId]) clients[userId] = [];
    const clientObj = { id: Date.now(), res };
    clients[userId].push(clientObj);
    req.on('close', () => {
        clients[userId] = clients[userId].filter(c => c.id !== clientObj.id);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
