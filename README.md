# Test_Website_01 — The Good Vibes Wall 🌈

A small, colorful test website. Visitors post notes to a shared wall, and the notes are saved in MySQL.

**Stack:** HTML, CSS, and vanilla JS (frontend) · Node.js + Express (backend) · MySQL (database)

## Setup

1. **Install Node dependencies**
   ```
   npm install
   ```
2. **Create your `.env` file.** Copy `.env.example` to `.env`, then set `DB_PASSWORD` to your MySQL root password (the one you picked when you installed MySQL).
   ```
   copy .env.example .env
   ```
3. **Make sure MySQL is running.** On Windows, the `MySQL80` service should show as *Running* in `services.msc`.
4. **Start the server**
   ```
   npm start
   ```
5. Open http://localhost:3000

The server creates the `fun_test_site` database and the `messages` table for you the first time it runs. `schema.sql` is the same setup in plain SQL, if you'd rather run it yourself in MySQL Workbench.

## API

| Method | Route                     | Description          |
|--------|---------------------------|----------------------|
| GET    | `/api/health`             | Database status      |
| GET    | `/api/messages`           | Latest 50 messages   |
| POST   | `/api/messages`           | Create a message     |
| POST   | `/api/messages/:id/like`  | Like a message       |
| DELETE | `/api/messages/:id`       | Delete a message     |
