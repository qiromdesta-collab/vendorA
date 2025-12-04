require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./db.js"); 
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {authenticateToken,authorizeRole,} = require("./middleware/authMiddleware.js");
const app = express();
const PORT = process.env.PORT || 3300;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors());
app.use(express.json());

app.get("/status", (req, res) => {
  res.json({ ok: true, service: "film-api" });
});

// Rute Vendor A (Warung Klontong - Legacy)
// Menggunakan format data jadul (string, singkatan) seperti yang diminta
app.get('/vendor-a', async (req,res)=>{
    const data=[
        // Data produk Kopi dan Gula Merah untuk Vendor A (Struktur Legacy)
        {"kd_produk":"A001", "nm_brg":"Kopi Bubuk 100g", "hrg":"15000", "ket_stok":"ada"},
        {"kd_produk":"A002", "nm_brg":"Gula Merah", "hrg":"12500", "ket_stok":"habis"}
    ];

    for(const p of data){
        // Logika konversi data legacy sebelum disimpan ke database
        // 1. Konversi harga string (p.hrg) ke integer
        // p.hrg.replace(/\./g, '') digunakan untuk menangani format harga '15.000' menjadi '15000' jika ada titik sebagai pemisah ribuan.
        const price = parseInt(p.hrg.replace(/\./g, ''), 10); 
        // 2. Konversi status stok ('ada'/'habis') ke format standar ('Tersedia'/'Kosong')
        const stockStatus = p.ket_stok.toLowerCase() === 'ada' ? "Tersedia" : "Kosong";

        await pool.query(
            // Perbaikan: String query harus dipisahkan dari array parameter.
            // Query harus berupa string tunggal.
            'INSERT INTO vendor_products(vendor,code,name,price,stock) VALUES($1,$2,$3,$4,$5)',
            ['VendorA', p.kd_produk, p.nm_brg, price, stockStatus] 
        );
    }
    
    res.json(data); // Mengirimkan data sebagai response
});


// Rute Vendor C telah dihapus karena tidak dibutuhkan


app.post("/auth/register", async (req, res, next) => {
  const { username, password } = req.body;
  if (!username || !password || password.length < 6) {
    return res
      .status(400)
      .json({ error: "Username dan password (min 6 char) harus diisi" });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const sql =
      "INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username";
    const result = await pool.query(sql, [
      username.toLowerCase(),
      hashedPassword,
      "user",
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      
      return res.status(409).json({ error: "Username sudah digunakan" });
    }
    next(err);
  }
});

app.post("/auth/register-admin", async (req, res, next) => {
  const { username, password } = req.body;
  if (!username || !password || password.length < 6) {
    return res
      .status(400)
      .json({ error: "Username dan password (min 6 char) harus diisi" });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const sql =
      "INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username";
    const result = await pool.query(sql, [
      username.toLowerCase(),
      hashedPassword,
      "admin",
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Username sudah digunakan" });
    }
    next(err);
  }
});

app.post("/auth/login", async (req, res, next) => {
  const { username, password } = req.body;
  try {
    
    const sql = "SELECT * FROM users WHERE username=$1"; 
    const result = await pool.query(sql, [username.toLowerCase()]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Kredensial tidak valid" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Kredensial tidak valid" });
    }
    const payload = {
      user: { id: user.id, username: user.username, role: user.role },
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
    res.json({ message: "Login berhasil", token: token });
  } catch (err) {
    next(err);
  }
});

app.get("/movies", async (req, res, next) => {
  const sql = `
        SELECT m.id, m.title, m.year, d.id as director_id, d.name as director_name
        FROM movies m
        LEFT JOIN directors d ON m.director_id = d.id
        ORDER BY m.id ASC
    `;
  try {
    const result = await pool.query(sql);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

app.get("/movies/:id", async (req, res, next) => {
  const sql = `
        SELECT m.id, m.title, m.year, d.id as director_id, d.name as director_name
        FROM movies m
        LEFT JOIN directors d ON m.director_id = d.id
        WHERE m.id = $1
    `;
  try {
    const result = await pool.query(sql, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Film tidak ditemukan" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

app.post("/movies", authenticateToken, async (req, res, next) => {
  const { title, director_id, year } = req.body;
  if (!title || !director_id || !year) {
    return res
      .status(400)
      .json({ error: "title, director_id, year wajib diisi" });
  }

  const sql =
    "INSERT INTO movies (title, director_id, year) VALUES ($1, $2, $3) RETURNING *";
  try {
    const result = await pool.query(sql, [title, director_id, year]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

app.put(
  "/movies/:id",
  [authenticateToken, authorizeRole("admin")],
  async (req, res, next) => {
    const { title, director_id, year } = req.body;
    const sql =
      "UPDATE movies SET title = $1, director_id = $2, year = $3 WHERE id = $4 RETURNING *";
    try {
      const result = await pool.query(sql, [
        title,
        director_id,
        year,
        req.params.id,
      ]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Film tidak ditemukan" });
      }
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

app.delete(
  "/movies/:id",
  [authenticateToken, authorizeRole("admin")],
  async (req, res, next) => {
    const sql = "DELETE FROM movies WHERE id = $1 RETURNING *";
    try {
      const result = await pool.query(sql, [req.params.id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Film tidak ditemukan" });
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

app.get("/directors", async (req, res, next) => {
  const sql = `
        SELECT id, name, "birthYear"
        FROM directors
        ORDER BY id ASC
    `;
  try {
    const result = await pool.query(sql);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

app.get("/directors/:id", async (req, res, next) => {
  const sql = `
        SELECT id, name, "birthYear"
        FROM directors
        WHERE id = $1
    `;
  try {
    const result = await pool.query(sql, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Sutradara tidak ditemukan" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

app.post("/directors", authenticateToken, async (req, res, next) => {
  const { name, birthYear } = req.body;
  if (!name || !birthYear) {
    return res.status(400).json({ error: "name dan birthYear wajib diisi" });
  }
  
  const sql = "INSERT INTO directors (name, \"birthYear\") VALUES ($1, $2) RETURNING *"; 
  try {
    const result = await pool.query(sql, [name, birthYear]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

app.put(
  "/directors/:id",
  [authenticateToken, authorizeRole("admin")],
  async (req, res, next) => {
    const { name, birthYear } = req.body;
    const sql =
      'UPDATE directors SET name = $1, "birthYear" = $2 WHERE id = $3 RETURNING *';
    try {
      const result = await pool.query(sql, [name, birthYear, req.params.id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Sutradara tidak ditemukan" });
      }
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

app.delete(
  "/directors/:id",
  [authenticateToken, authorizeRole("admin")],
  async (req, res, next) => {
    const sql = "DELETE FROM directors WHERE id = $1 RETURNING *";
    try {
      const result = await pool.query(sql, [req.params.id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Sutradara tidak ditemukan" });
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

app.use((req, res) => {
  res.status(404).json({ error: "Rute tidak ditemukan" });
});

app.use((err, req, res, next) => {
  console.error("[SERVER ERROR]", err.stack);
  res.status(500).json({ error: "Terjadi kesalahan pada server" });
});

app.listen(PORT,() => console.log("Server berjalan di port ${PORT"));