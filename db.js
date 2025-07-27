const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'assignments.db');
const DEV = process.env.DEV === 'TRUE';

const db = new sqlite3.Database(DB_PATH, err => {
    if (err) return console.error(new Date().toISOString(), '[DB]', err);
    console.log(new Date().toISOString(), `✅ Connected to SQLite database. DEV=${DEV}`);
});

db.serialize(() => {
    db.run(`
    CREATE TABLE IF NOT EXISTS assignments (
      user_id    TEXT NOT NULL,
      profession TEXT NOT NULL,
      PRIMARY KEY (user_id, profession)
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);
});

function fetchAllAssignments() {
    return new Promise((res, rej) => {
        db.all(`SELECT user_id, profession FROM assignments`, [], (e, rows) => {
            if (e) return rej(e);
            const m = {};
            rows.forEach(r => {
                m[r.user_id] = m[r.user_id] || [];
                m[r.user_id].push(r.profession);
            });
            res(m);
        });
    });
}


function getMeta(key) {
    return new Promise((res, rej) => {
        db.get(`SELECT value FROM meta WHERE key = ?`, [key], (e, row) => {
            if (e) return rej(e);
            res(row?.value);
        });
    });
}

function setMeta(key, value) {
    return new Promise((res, rej) => {
        db.run(
            `INSERT INTO meta(key,value) VALUES(?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
            [key, value],
            err => err ? rej(err) : res()
        );
    });
}

module.exports = {
    db,
    fetchAllAssignments,
    getMeta,
    setMeta,
    DEV
};
