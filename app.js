require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(express.json());
app.use(cors());

// Konfigurasi koneksi ke database
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Endpoint untuk menangani request RFID
app.post("/api/animal", async (req, res) => {
    console.log("Request received at /api/animal"); // Tambah log untuk debug
    console.log("Request body:", req.body);

    const { uid } = req.body;
    if (!uid) {
        console.log("UID is missing!");
        return res.status(400).json({ error: "UID is required" });
    }

    try {
        const result = await pool.query("SELECT * FROM animals WHERE rfid_code = $1", [uid]);
        if (result.rows.length > 0) {
            console.log("Data found:", result.rows[0]);
            res.json(result.rows[0]);
        } else {
            console.log("Data not found for UID:", uid);
            res.status(404).json({ error: "Data not found" });
        }
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Gunakan port yang diberikan oleh Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
