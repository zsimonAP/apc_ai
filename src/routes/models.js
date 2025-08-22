import { Router } from 'express';
import { listLocalModels, pullModel } from '../services/ollama.js';

const router = Router();

// GET /api/models -> list local models installed
router.get('/', async (req, res) => {
  try {
    const models = await listLocalModels();
    res.json(models);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Unable to list models' });
  }
});

// POST /api/models/pull { model: "gemma3:1b" }
router.post('/pull', async (req, res) => {
  const { model } = req.body || {};
  if (!model) return res.status(400).json({ error: 'model is required' });

  try {
    const result = await pullModel(model);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to pull model' });
  }
});

export default router;
