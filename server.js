const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// CLAVE MAESTRA: Solo tu juego de Roblox sabe esta clave
const MASTER_SECRET = "CarDashSeguro2026";

let userState = {};

// Recibir orden de Roblox (Protegido con contraseña)
app.post('/api/control', (req, res) => {
    const authHeader = req.headers['x-auth-token'];
    if (authHeader !== MASTER_SECRET) {
        return res.status(403).json({ error: "Acceso no autorizado" });
    }

    const { pin, action, data } = req.body;
    userState[pin] = {
        action: action,
        data: data,
        timestamp: Date.now()
    };

    res.json({ success: true });
});

// La web consulta usando su PIN privado
app.get('/api/status/:pin', (req, res) => {
    const pin = req.params.pin;
    const state = userState[pin] || { action: 'none', data: '', timestamp: 0 };
    res.json(state);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor protegido en puerto ${PORT}`));
