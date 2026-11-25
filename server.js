const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Guarda la última orden de cada jugador
let userState = {};

// Recibe la orden de Roblox
app.post('/api/control', (req, res) => {
    const { userId, action, data } = req.body;
    console.log(`[Roblox -> Web] Usuario: ${userId} | Acción: ${action} | Datos: ${data}`);

    userState[userId] = {
        action: action,
        data: data,
        timestamp: Date.now()
    };

    res.json({ success: true });
});

// La página web consulta aquí cada segundo (INFALIBLE)
app.get('/api/status/:userId', (req, res) => {
    const userId = req.params.userId;
    const state = userState[userId] || { action: 'none', data: '', timestamp: 0 };
    res.json(state);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
