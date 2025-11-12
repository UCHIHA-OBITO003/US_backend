import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import { sanitizeInput, hashPassword } from '../utils/helpers.js';

const router = express.Router();

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-passwordHash -passcode');
    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user profile
router.put('/profile',
  authenticateToken,
  body('displayName').optional().isLength({ min: 1, max: 50 }).trim(),
  body('avatar').optional().isURL(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { displayName, avatar } = req.body;
      const updates = {};

      if (displayName) updates.displayName = sanitizeInput(displayName);
      if (avatar) updates.avatar = avatar;

      const user = await User.findByIdAndUpdate(
        req.user._id,
        updates,
        { new: true }
      ).select('-passwordHash -passcode');

      res.json({ message: 'Profile updated', user });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Update mood
router.put('/mood',
  authenticateToken,
  body('mood').notEmpty(),
  async (req, res) => {
    try {
      const { mood } = req.body;

      const user = await User.findByIdAndUpdate(
        req.user._id,
        { currentMood: mood },
        { new: true }
      ).select('-passwordHash -passcode');

      res.json({ message: 'Mood updated', mood: user.currentMood });
    } catch (error) {
      console.error('Update mood error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Update theme
router.put('/theme',
  authenticateToken,
  body('theme').isIn(['pink', 'purple', 'blue', 'dark']),
  async (req, res) => {
    try {
      const { theme } = req.body;

      const user = await User.findByIdAndUpdate(
        req.user._id,
        { theme },
        { new: true }
      ).select('-passwordHash -passcode');

      res.json({ message: 'Theme updated', theme: user.theme });
    } catch (error) {
      console.error('Update theme error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Set/update passcode
router.put('/passcode',
  authenticateToken,
  body('passcode').isLength({ min: 4, max: 6 }),
  async (req, res) => {
    try {
      const { passcode } = req.body;

      const hashedPasscode = await hashPassword(passcode);

      await User.findByIdAndUpdate(req.user._id, {
        passcode: hashedPasscode
      });

      res.json({ message: 'Passcode set successfully' });
    } catch (error) {
      console.error('Set passcode error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Toggle biometric
router.put('/biometric',
  authenticateToken,
  body('enabled').isBoolean(),
  async (req, res) => {
    try {
      const { enabled } = req.body;

      await User.findByIdAndUpdate(req.user._id, {
        biometricEnabled: enabled
      });

      res.json({ message: 'Biometric setting updated', enabled });
    } catch (error) {
      console.error('Toggle biometric error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Search users
router.get('/search',
  authenticateToken,
  async (req, res) => {
    try {
      const { query } = req.query;

      if (!query || query.length < 2) {
        return res.status(400).json({ error: 'Query too short' });
      }

      const users = await User.find({
        $or: [
          { username: new RegExp(query, 'i') },
          { displayName: new RegExp(query, 'i') }
        ],
        _id: { $ne: req.user._id } // Exclude current user
      })
        .select('username displayName avatar currentMood')
        .limit(10);

      res.json({ users });
    } catch (error) {
      console.error('Search users error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get user by ID
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('username displayName avatar currentMood isOnline lastSeen theme');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

