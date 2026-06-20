# Study-pro
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.get("/", (req, res) => {
  res.json({ status: "ok" });
});

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
      return res.status(409).json({ error: "username already taken" });
    }
    console.error(err);
    res.status(500).json({ error: "could not create user" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }
  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "invalid username or password" });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "invalid username or password" });
    res.json({ id: user.id, username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "login failed" });
  }
});

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
{
  "name": "lockedin-backend",
  "version": "1.0.0",
  "description": "Express backend with Supabase Postgres for user accounts and posts",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "express": "^4.19.2",
    "cors": "^2.8.5",
    "pg": "^8.12.0",
    "bcryptjs": "^2.4.3",
    "dotenv": "^16.4.5"
  }
}
create extension if not exists "uuid-ossp";

create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  username text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists posts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_posts_user_id on posts(user_id);
create index if not exists idx_posts_created_at on posts(created_at desc);
