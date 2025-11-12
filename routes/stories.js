import express from 'express';
import { body, validationResult } from 'express-validator';
import Story from '../models/Story.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Post a story
router.post('/create',
  authenticateToken,
  body('mediaUrl').notEmpty(),
  body('type').isIn(['image', 'video']),
  async (req, res) => {
    try {
      const { mediaUrl, type, caption } = req.body;

      // Stories expire after 24 hours
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const story = new Story({
        user: req.user._id,
        mediaUrl,
        type,
        caption: caption || '',
        expiresAt
      });

      await story.save();

      res.status(201).json({
        message: 'Story posted!',
        story
      });
    } catch (error) {
      console.error('Post story error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get stories from friends
router.get('/friends', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const friendIds = user.friends;

    // Get all non-expired stories from friends
    const stories = await Story.find({
      user: { $in: friendIds },
      expiresAt: { $gt: new Date() }
    })
      .populate('user', 'displayName avatar username')
      .sort({ createdAt: -1 });

    // Group stories by user
    const groupedStories = {};
    stories.forEach(story => {
      const userId = story.user._id.toString();
      if (!groupedStories[userId]) {
        groupedStories[userId] = {
          user: story.user,
          stories: [],
          hasViewed: false
        };
      }
      
      // Check if current user has viewed this story
      const hasViewed = story.views.some(v => v.user.toString() === req.user._id.toString());
      if (!hasViewed) {
        groupedStories[userId].hasViewed = false;
      }
      
      groupedStories[userId].stories.push(story);
    });

    res.json({ stories: Object.values(groupedStories) });
  } catch (error) {
    console.error('Get stories error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get own stories
router.get('/my-stories', authenticateToken, async (req, res) => {
  try {
    const stories = await Story.find({
      user: req.user._id,
      expiresAt: { $gt: new Date() }
    })
      .sort({ createdAt: -1 });

    res.json({ stories });
  } catch (error) {
    console.error('Get own stories error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark story as viewed
router.post('/:storyId/view', authenticateToken, async (req, res) => {
  try {
    const { storyId } = req.params;

    const story = await Story.findById(storyId);

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    // Check if already viewed
    const alreadyViewed = story.views.some(
      v => v.user.toString() === req.user._id.toString()
    );

    if (!alreadyViewed) {
      story.views.push({
        user: req.user._id,
        viewedAt: new Date()
      });
      await story.save();
    }

    res.json({ message: 'Story viewed' });
  } catch (error) {
    console.error('View story error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete story
router.delete('/:storyId', authenticateToken, async (req, res) => {
  try {
    const { storyId } = req.params;

    const story = await Story.findById(storyId);

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    if (story.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await Story.findByIdAndDelete(storyId);

    res.json({ message: 'Story deleted' });
  } catch (error) {
    console.error('Delete story error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

