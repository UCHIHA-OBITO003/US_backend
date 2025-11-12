import express from 'express';
import { body, validationResult } from 'express-validator';
import Memory from '../models/Memory.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Save snap to memories
router.post('/save',
  authenticateToken,
  body('mediaUrl').notEmpty(),
  body('type').isIn(['image', 'video']),
  async (req, res) => {
    try {
      const { mediaUrl, type, caption, isPrivate } = req.body;

      const memory = new Memory({
        user: req.user._id,
        mediaUrl,
        type,
        caption: caption || '',
        isPrivate: isPrivate || false
      });

      await memory.save();

      res.status(201).json({
        message: 'Saved to Memories!',
        memory
      });
    } catch (error) {
      console.error('Save memory error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get all memories
router.get('/', authenticateToken, async (req, res) => {
  try {
    const memories = await Memory.find({
      user: req.user._id,
      isPrivate: false
    })
      .sort({ createdAt: -1 });

    res.json({ memories });
  } catch (error) {
    console.error('Get memories error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get private memories ('My Eyes Only')
router.get('/private', authenticateToken, async (req, res) => {
  try {
    const memories = await Memory.find({
      user: req.user._id,
      isPrivate: true
    })
      .sort({ createdAt: -1 });

    res.json({ memories });
  } catch (error) {
    console.error('Get private memories error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete memory
router.delete('/:memoryId', authenticateToken, async (req, res) => {
  try {
    const { memoryId } = req.params;

    const memory = await Memory.findById(memoryId);

    if (!memory) {
      return res.status(404).json({ error: 'Memory not found' });
    }

    if (memory.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await Memory.findByIdAndDelete(memoryId);

    res.json({ message: 'Memory deleted' });
  } catch (error) {
    console.error('Delete memory error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

