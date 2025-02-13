require('dotenv').config();
const Joi = require('joi');
const express = require('express');
const cors = require('cors');
const { Pool, Client } = require('pg');
const TelegramBot = require('node-telegram-bot-api');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const port = 3002;

// Middleware
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // Pastikan sesuai dengan yang digunakan di Render
    ssl: { rejectUnauthorized: false } // Gunakan konfigurasi yang sama dengan kode kedua
});

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
client.connect();


// Setup Telegram Bot dengan Webhook
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token);
const webhookUrl = `${process.env.WEBHOOK_URL}/telegram-webhook`;
bot.setWebHook(webhookUrl);
const chatIds = ['6994035359'];

// WebSocket setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://127.0.0.1:5500",
    methods: ["GET", "POST"]
  }
});

// Validasi schema dengan Joi
const schema = Joi.object({
    id: Joi.string().trim().min(1).required(),
    nama: Joi.string().trim().min(1).required(),
    jenis: Joi.string().trim().min(1).required(),
    usia: Joi.number().integer().min(0).required(),
    status_kesehatan: Joi.string().trim().min(3).required(),
});

// Endpoint untuk ambil daftar hewan dengan pagination, search, dan sorting
app.get('/hewan', async (req, res) => {
    let { page = 1, limit = 10, search = '', sortBy = 'id', order = 'ASC' } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const validColumns = ['nama', 'jenis', 'usia', 'status_kesehatan', 'id'];
    order = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    if (!validColumns.includes(sortBy)) {
        return res.status(400).json({ message: 'Kolom sortBy tidak valid' });
    }

    try {
        const offset = (page - 1) * limit;
        const query = `
            SELECT * FROM hewan
            WHERE nama ILIKE $1 OR jenis ILIKE $1
            ORDER BY ${sortBy} ${order}
            LIMIT $2 OFFSET $3
        `;
        const result = await pool.query(query, [`%${search}%`, limit, offset]);
        const countQuery = `SELECT COUNT(*) FROM hewan WHERE nama ILIKE $1 OR jenis ILIKE $1`;
        const totalCount = await pool.query(countQuery, [`%${search}%`]);

        res.json({
            total: parseInt(totalCount.rows[0].count),
            page,
            limit,
            totalPages: Math.ceil(totalCount.rows[0].count / limit),
            data: result.rows,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Terjadi kesalahan di server' });
    }
});

// Endpoint webhook Telegram
app.post('/telegram-webhook', (req, res) => {
    const update = req.body;
    console.log('Update dari Telegram:', update);

    if (update.message) {
        const chatId = update.message.chat.id;
        const text = update.message.text;
        bot.sendMessage(chatId, `Anda mengirim: ${text}`);
    }

    res.sendStatus(200);
});

// Endpoint untuk menerima data UID dari ESP8266
app.post('/api/animal', async (req, res) => {
    const rfidUid = req.body.uid;
    console.log('UID diterima:', rfidUid);

    try {
        const query = 'SELECT * FROM hewan WHERE id = $1';
        const result = await client.query(query, [rfidUid]);

        if (result.rows.length > 0) {
            const hewan = result.rows[0];
            const message = `Data Hewan:\nNama: ${hewan.nama}\nJenis: ${hewan.jenis}\nUsia: ${hewan.usia} tahun\nStatus Kesehatan: ${hewan.status_kesehatan}`;

            // Kirimkan pesan ke chat ID Telegram
            chatIds.forEach(id => bot.sendMessage(id, message));

            // Kirim data ke WebSocket
            io.emit('rfid-scanned', {
                rfid_code: rfidUid,
                nama: hewan.nama,
                info_tambahan: hewan.jenis,
                waktu_scan: new Date().toLocaleString()
            });

            res.status(200).send('Data diterima');
        } else {
            chatIds.forEach(id => bot.sendMessage(id, `Tidak ditemukan data untuk UID: ${rfidUid}`));
            res.status(404).send('Data tidak ditemukan');
        }
    } catch (error) {
        console.error('Error querying database:', error);
        res.status(500).send('Terjadi kesalahan saat mengambil data');
    }
});

// Jalankan server
server.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});