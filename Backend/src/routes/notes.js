const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../db');
const auth = require('../middleware/auth');
const { noteCreateSchema, noteUpdateSchema } = require('../utils/validators');

const router = express.Router();
router.use(auth);

// Multer config: store files in /uploads
const upload = multer({
  dest: path.join(__dirname, '..', '..', 'uploads'),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// GET /api/notes  -> list current user's notes
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, description, file_url, uploaded_by, created_at FROM notes WHERE uploaded_by = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/notes/:id -> get one (owned by user)
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, description, file_url, uploaded_by, created_at FROM notes WHERE id = ? AND uploaded_by = ?',
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/notes  -> create (optional file upload)
router.post('/', upload.single('file'), async (req, res) => {
  try {
    // form-data: title, description, file?
    const parsed = noteCreateSchema.parse({
      title: req.body.title,
      description: req.body.description
    });

    let file_url = null;
    if (req.file) {
      // serve via /uploads/<filename>
      file_url = `/uploads/${req.file.filename}`;
    }

    const [result] = await pool.query(
      'INSERT INTO notes (title, description, file_url, uploaded_by) VALUES (?, ?, ?, ?)',
      [parsed.title, parsed.description || null, file_url, req.user.id]
    );

    const [rows] = await pool.query(
      'SELECT id, title, description, file_url, uploaded_by, created_at FROM notes WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (req.file) {
      // cleanup if validation failed after upload
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: err.issues.map(i => i.message).join(', ') });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/notes/:id -> update (only your own)
router.put('/:id', upload.single('file'), async (req, res) => {
  try {
    const parsed = noteUpdateSchema.parse({
      title: req.body.title,
      description: req.body.description
    });

    // ensure ownership
    const [exists] = await pool.query(
      'SELECT id, file_url FROM notes WHERE id = ? AND uploaded_by = ?',
      [req.params.id, req.user.id]
    );
    if (exists.length === 0) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(404).json({ error: 'Not found' });
    }

    let newFileUrl = exists[0].file_url;
    if (req.file) {
      // delete old file if any
      if (exists[0].file_url) {
        try {
          const old = path.join(__dirname, '..', '..', exists[0].file_url);
          fs.unlinkSync(old);
        } catch {}
      }
      newFileUrl = `/uploads/${req.file.filename}`;
    }

    const fields = [];
    const values = [];

    if (parsed.title !== undefined) { fields.push('title = ?'); values.push(parsed.title); }
    if (parsed.description !== undefined) { fields.push('description = ?'); values.push(parsed.description || null); }
    if (req.file) { fields.push('file_url = ?'); values.push(newFileUrl); }

    if (fields.length === 0) return res.status(400).json({ error: 'No changes' });

    values.push(req.params.id, req.user.id);

    await pool.query(
      `UPDATE notes SET ${fields.join(', ')} WHERE id = ? AND uploaded_by = ?`,
      values
    );

    const [rows] = await pool.query(
      'SELECT id, title, description, file_url, uploaded_by, created_at FROM notes WHERE id = ?',
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: err.issues.map(i => i.message).join(', ') });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/notes/:id -> delete (only your own)
router.delete('/:id', async (req, res) => {
  try {
    // fetch for file cleanup
    const [exists] = await pool.query(
      'SELECT id, file_url FROM notes WHERE id = ? AND uploaded_by = ?',
      [req.params.id, req.user.id]
    );
    if (exists.length === 0) return res.status(404).json({ error: 'Not found' });

    await pool.query('DELETE FROM notes WHERE id = ? AND uploaded_by = ?', [req.params.id, req.user.id]);

    if (exists[0].file_url) {
      try {
        const old = path.join(__dirname, '..', '..', exists[0].file_url);
        fs.unlinkSync(old);
      } catch {}
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
