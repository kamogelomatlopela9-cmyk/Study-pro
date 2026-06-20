// server.js
// Express backend for user accounts + posts, designed to run on Render
// and connect to a Supabase Postgres database via DATABASE_URL.

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

// Supabase connection (DATABASE_URL is set as an env var on Render, never hardcoded)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Supabase's managed Postgres
});

// Health check — useful for confirming the Render deploy is alive
app.get("/", (req, res) => {
  res.json({ status: "ok" });
});

// Create a user account
app.post("/api/users", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, created_at",
      [username, password_hash]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      // unique_violation on username
      return res.status(409).json({ error: "username already taken" });
    }
    console.error(err);
    res.status(500).json({ error: "could not create user" });
  }
});

// Log in an existing user
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: "invalid username or password" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "invalid username or password" });
    }

    res.json({ id: user.id, username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "login failed" });
  }
});

// Create a post
app.post("/api/posts", async (req, res) => {
  const { user_id, content } = req.body;

  if (!user_id || !content) {
    return res.status(400).json({ error: "user_id and content are required" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO posts (user_id, content) VALUES ($1, $2) RETURNING id, content, created_at, user_id",
      [user_id, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not create post" });
  }
});

// Get the feed (most recent posts first, joined with the username)
app.get("/api/posts", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT posts.id, posts.content, posts.created_at, users.username
       FROM posts
       JOIN users ON posts.user_id = users.id
       ORDER BY posts.created_at DESC
       LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not fetch posts" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
