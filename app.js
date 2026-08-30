// app.js — Internship Board API (single-file version, uses Node's built-in SQLite)
// Run: npm install express express-validator
//      node app.js

const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { body, query, param, validationResult } = require('express-validator');

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json());

// ---------- DATABASE SETUP ----------
const db = new DatabaseSync('data.sqlite');

db.exec(`
CREATE TABLE IF NOT EXISTS internships (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  domain TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('Remote','Hybrid','On-site')),
  location TEXT,
  duration_weeks INTEGER,
  skills TEXT,
  openings INTEGER NOT NULL DEFAULT 0,
  applications_open INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  internship_id TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  applicant_email TEXT NOT NULL,
  resume_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (internship_id, applicant_email),
  FOREIGN KEY (internship_id) REFERENCES internships(id)
);
`);

// ---------- SEED DATA (only if table empty) ----------
const seedRows = [
  { id: 'INT-101', title: 'Frontend Intern', domain: 'Full Stack Development', mode: 'Remote', location: 'India', duration_weeks: 4, skills: ['HTML', 'CSS', 'JavaScript'], openings: 3 },
  { id: 'INT-102', title: 'API Engineering Intern', domain: 'Full Stack Development', mode: 'Hybrid', location: 'Pune', duration_weeks: 6, skills: ['Node.js', 'SQL', 'Testing'], openings: 2 },
  { id: 'INT-103', title: 'UI/UX Intern', domain: 'UI/UX', mode: 'Remote', location: 'India', duration_weeks: 4, skills: ['Figma', 'Research', 'Accessibility'], openings: 1 },
  { id: 'INT-104', title: 'Data Analyst Intern', domain: 'Data Analytics', mode: 'On-site', location: 'Bengaluru', duration_weeks: 6, skills: ['Excel', 'SQL', 'Data visualisation'], openings: 2 },
  { id: 'INT-105', title: 'Security Operations Intern', domain: 'Cyber Security', mode: 'Remote', location: 'India', duration_weeks: 5, skills: ['Linux', 'Logs', 'Networking'], openings: 1 },
];

const countRow = db.prepare('SELECT COUNT(*) c FROM internships').get();
if (countRow.c === 0) {
  const insert = db.prepare(`
    INSERT INTO internships (id, title, domain, mode, location, duration_weeks, skills, openings)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of seedRows) {
    insert.run(r.id, r.title, r.domain, r.mode, r.location, r.duration_weeks, JSON.stringify(r.skills), r.openings);
  }
  console.log(`Seeded ${seedRows.length} internships.`);
}

// ---------- HELPERS ----------
function formatInternship(row) {
  return {
    id: row.id,
    title: row.title,
    domain: row.domain,
    mode: row.mode,
    location: row.location,
    duration_weeks: row.duration_weeks,
    skills: row.skills ? JSON.parse(row.skills) : [],
    openings: row.openings,
    applications_open: !!row.applications_open,
  };
}

function ok(res, data, extra = {}) {
  return res.json({ status: 'success', data, ...extra });
}

function fail(res, statusCode, message, errors = undefined) {
  const body = { status: 'error', message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
}

function handleValidation(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return fail(res, 400, 'Validation failed', result.array().map(e => ({
      field: e.path,
      message: e.msg,
    })));
  }
  next();
}

function safeLog(req) {
  const safeBody = { ...req.body };
  delete safeBody.applicant_email;
  delete safeBody.resume_url;
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, safeBody);
}
app.use((req, res, next) => { safeLog(req); next(); });

// ---------- VALIDATION RULES ----------
const internshipCreateRules = [
  body('id').trim().notEmpty().withMessage('id is required'),
  body('title').trim().notEmpty().withMessage('title is required'),
  body('domain').trim().notEmpty().withMessage('domain is required'),
  body('mode').isIn(['Remote', 'Hybrid', 'On-site']).withMessage('mode must be Remote, Hybrid, or On-site'),
  body('location').optional().trim(),
  body('duration_weeks').optional().isInt({ min: 1 }).withMessage('duration_weeks must be a positive integer'),
  body('skills').optional().isArray().withMessage('skills must be an array'),
  body('openings').isInt({ min: 0 }).withMessage('openings must be 0 or more'),
];

const internshipUpdateRules = [
  body('title').optional().trim().notEmpty(),
  body('domain').optional().trim().notEmpty(),
  body('mode').optional().isIn(['Remote', 'Hybrid', 'On-site']),
  body('location').optional().trim(),
  body('duration_weeks').optional().isInt({ min: 1 }),
  body('skills').optional().isArray(),
  body('openings').optional().isInt({ min: 0 }),
  body('applications_open').optional().isBoolean(),
];

const applicationRules = [
  body('applicant_name').trim().notEmpty().withMessage('applicant_name is required'),
  body('applicant_email').trim().isEmail().withMessage('a valid applicant_email is required').normalizeEmail(),
  body('resume_url').optional({ nullable: true }).isURL({ protocols: ['https'], require_protocol: true })
    .withMessage('resume_url must be a valid https URL'),
];

const listQueryRules = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('domain').optional().trim(),
  query('mode').optional().isIn(['Remote', 'Hybrid', 'On-site']),
];

const idParamRule = [param('id').trim().notEmpty()];

// ---------- ROUTES ----------
const router = express.Router();

// LIST (pagination + filters)
router.get('/internships', listQueryRules, handleValidation, (req, res) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || 10;
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (req.query.domain) { where.push('domain = ?'); params.push(req.query.domain); }
  if (req.query.mode) { where.push('mode = ?'); params.push(req.query.mode); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) c FROM internships ${whereSql}`).get(...params).c;
  const rows = db.prepare(`SELECT * FROM internships ${whereSql} ORDER BY id LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  ok(res, rows.map(formatInternship), {
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  });
});

// DETAIL
router.get('/internships/:id', idParamRule, handleValidation, (req, res) => {
  const row = db.prepare('SELECT * FROM internships WHERE id = ?').get(req.params.id);
  if (!row) return fail(res, 404, 'Internship not found');
  ok(res, formatInternship(row));
});

// CREATE
router.post('/internships', internshipCreateRules, handleValidation, (req, res) => {
  const b = req.body;
  const exists = db.prepare('SELECT id FROM internships WHERE id = ?').get(b.id);
  if (exists) return fail(res, 409, `Internship with id "${b.id}" already exists`);

  db.prepare(`
    INSERT INTO internships (id, title, domain, mode, location, duration_weeks, skills, openings, applications_open)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    b.id,
    b.title,
    b.domain,
    b.mode,
    b.location || null,
    b.duration_weeks || null,
    JSON.stringify(b.skills || []),
    b.openings
  );

  const row = db.prepare('SELECT * FROM internships WHERE id = ?').get(b.id);
  res.status(201).json({ status: 'success', data: formatInternship(row) });
});

// UPDATE (partial)
router.patch('/internships/:id', idParamRule, internshipUpdateRules, handleValidation, (req, res) => {
  const existing = db.prepare('SELECT * FROM internships WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, 404, 'Internship not found');

  const title = req.body.title ?? existing.title;
  const domain = req.body.domain ?? existing.domain;
  const mode = req.body.mode ?? existing.mode;
  const location = req.body.location ?? existing.location;
  const duration_weeks = req.body.duration_weeks ?? existing.duration_weeks;
  const skills = req.body.skills ? JSON.stringify(req.body.skills) : existing.skills;
  const openings = req.body.openings ?? existing.openings;
  const applications_open = req.body.applications_open !== undefined
    ? (req.body.applications_open ? 1 : 0)
    : existing.applications_open;

  db.prepare(`
    UPDATE internships SET title=?, domain=?, mode=?, location=?,
      duration_weeks=?, skills=?, openings=?, applications_open=?
    WHERE id=?
  `).run(title, domain, mode, location, duration_weeks, skills, openings, applications_open, req.params.id);

  const row = db.prepare('SELECT * FROM internships WHERE id = ?').get(req.params.id);
  ok(res, formatInternship(row));
});

// DELETE
router.delete('/internships/:id', idParamRule, handleValidation, (req, res) => {
  const result = db.prepare('DELETE FROM internships WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return fail(res, 404, 'Internship not found');
  res.status(204).send();
});

// CREATE APPLICATION
router.post('/internships/:id/applications', idParamRule, applicationRules, handleValidation, (req, res) => {
  const internship = db.prepare('SELECT * FROM internships WHERE id = ?').get(req.params.id);
  if (!internship) return fail(res, 404, 'Internship not found');
  if (!internship.applications_open) return fail(res, 400, 'Applications are closed for this internship');

  const dup = db.prepare(
    'SELECT id FROM applications WHERE internship_id = ? AND applicant_email = ?'
  ).get(req.params.id, req.body.applicant_email);
  if (dup) return fail(res, 409, 'You have already applied to this internship');

  const result = db.prepare(`
    INSERT INTO applications (internship_id, applicant_name, applicant_email, resume_url)
    VALUES (?, ?, ?, ?)
  `).run(req.params.id, req.body.applicant_name, req.body.applicant_email, req.body.resume_url || null);

  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ status: 'success', data: row });
});

// LIST APPLICATIONS for an internship
router.get('/internships/:id/applications', idParamRule, handleValidation, (req, res) => {
  const internship = db.prepare('SELECT id FROM internships WHERE id = ?').get(req.params.id);
  if (!internship) return fail(res, 404, 'Internship not found');
  const rows = db.prepare('SELECT * FROM applications WHERE internship_id = ? ORDER BY id').all(req.params.id);
  ok(res, rows);
});

app.use('/api', router);

// ---------- 404 + ERROR HANDLERS ----------
app.use((req, res) => fail(res, 404, 'Route not found'));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  fail(res, 500, 'Internal server error');
});

app.listen(PORT, () => console.log(`Internship API running on http://localhost:${PORT}`));