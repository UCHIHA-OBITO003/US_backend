import express from 'express';
import { body, validationResult } from 'express-validator';
import Streak from '../models/Streak.js';
import SharedAlbum from '../models/SharedAlbum.js';
import Message from '../models/Message.js';
import { authenticateToken } from '../middleware/auth.js';
import { calculateLoveMeter, shouldUpdateStreak } from '../utils/helpers.js';

const router = express.Router();

// Get or create streak
router.get('/streak/:partnerId', authenticateToken, async (req, res) => {
  try {
    const { partnerId } = req.params;
    const userId = req.user._id;

    // Sort IDs to ensure consistent query
    const [user1, user2] = [userId, partnerId].sort();

    let streak = await Streak.findOne({
      $or: [
        { user1, user2 },
        { user1: user2, user2: user1 }
      ]
    });

    if (!streak) {
      // Create new streak
      streak = new Streak({
        user1,
        user2,
        currentStreak: 0,
        longestStreak: 0,
        lastMessageDate: new Date()
      });
      await streak.save();
    }

    res.json({ streak });
  } catch (error) {
    console.error('Get streak error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update streak (called after SNAP sent - photo/video only)
router.post('/streak/update',
  authenticateToken,
  body('partnerId').notEmpty(),
  body('isSnap').isBoolean(),
  async (req, res) => {
    try {
      const { partnerId, isSnap } = req.body;
      
      // Only count snaps (photos/videos) for streaks, not regular messages
      if (!isSnap) {
        return res.json({ message: 'Only snaps count towards streaks' });
      }

      const userId = req.user._id;
      const [user1, user2] = [userId.toString(), partnerId.toString()].sort();

      let streak = await Streak.findOne({
        $or: [
          { user1, user2 },
          { user1: user2, user2: user1 }
        ]
      });

      if (!streak) {
        streak = new Streak({ 
          user1, 
          user2,
          user1LastSnapDate: userId.toString() === user1 ? new Date() : null,
          user2LastSnapDate: userId.toString() === user2 ? new Date() : null
        });
        await streak.save();
        return res.json({ streak });
      }

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Determine which user sent the snap
      const isUser1 = userId.toString() === user1;
      const userLastSnapDate = isUser1 ? streak.user1LastSnapDate : streak.user2LastSnapDate;
      const partnerLastSnapDate = isUser1 ? streak.user2LastSnapDate : streak.user1LastSnapDate;

      // Check if user already snapped today
      if (userLastSnapDate) {
        const lastSnapDay = new Date(userLastSnapDate.getFullYear(), userLastSnapDate.getMonth(), userLastSnapDate.getDate());
        if (lastSnapDay.getTime() === today.getTime()) {
          // Already snapped today, just check if both users have snapped
          const partnerSnappedToday = partnerLastSnapDate && 
            new Date(partnerLastSnapDate.getFullYear(), partnerLastSnapDate.getMonth(), partnerLastSnapDate.getDate()).getTime() === today.getTime();
          
          streak.bothSnappedToday = partnerSnappedToday;
          
          // If both snapped today and streak wasn't counted yet, increment
          if (partnerSnappedToday && !streak.lastSnapDate) {
            streak.currentStreak += 1;
            streak.lastSnapDate = new Date();
            
            if (streak.currentStreak > streak.longestStreak) {
              streak.longestStreak = streak.currentStreak;
            }
          }
          
          await streak.save();
          return res.json({ streak, message: 'Already snapped today' });
        }
      }

      // Update user's last snap date
      if (isUser1) {
        streak.user1LastSnapDate = new Date();
      } else {
        streak.user2LastSnapDate = new Date();
      }

      // Check if partner snapped yesterday or today
      const partnerSnappedToday = partnerLastSnapDate && 
        new Date(partnerLastSnapDate.getFullYear(), partnerLastSnapDate.getMonth(), partnerLastSnapDate.getDate()).getTime() === today.getTime();
      
      const partnerSnappedYesterday = partnerLastSnapDate && 
        new Date(partnerLastSnapDate.getFullYear(), partnerLastSnapDate.getMonth(), partnerLastSnapDate.getDate()).getTime() === yesterday.getTime();

      // Check if current user snapped yesterday
      const userSnappedYesterday = userLastSnapDate && 
        new Date(userLastSnapDate.getFullYear(), userLastSnapDate.getMonth(), userLastSnapDate.getDate()).getTime() === yesterday.getTime();

      // Streak logic: Both users must snap within 24 hours
      if (partnerSnappedToday) {
        // Both snapped today! Increment streak
        streak.bothSnappedToday = true;
        
        if (userSnappedYesterday && partnerSnappedYesterday) {
          // Continuing streak
          streak.currentStreak += 1;
        } else if (!streak.lastSnapDate || streak.currentStreak === 0) {
          // Starting new streak
          streak.currentStreak = 1;
        } else {
          // Check if streak was maintained
          const lastSnapDay = new Date(streak.lastSnapDate.getFullYear(), streak.lastSnapDate.getMonth(), streak.lastSnapDate.getDate());
          if (yesterday.getTime() === lastSnapDay.getTime()) {
            streak.currentStreak += 1;
          } else {
            // Streak broken, start over
            streak.currentStreak = 1;
          }
        }
        
        streak.lastSnapDate = new Date();
        
        if (streak.currentStreak > streak.longestStreak) {
          streak.longestStreak = streak.currentStreak;
        }

        // Achievements
        if (streak.currentStreak === 3) {
          streak.achievements.push({ type: '3_day_streak', timestamp: new Date() });
        } else if (streak.currentStreak === 10) {
          streak.achievements.push({ type: '10_day_streak', timestamp: new Date() });
        } else if (streak.currentStreak === 30) {
          streak.achievements.push({ type: '30_day_streak', timestamp: new Date() });
        } else if (streak.currentStreak === 100) {
          streak.achievements.push({ type: '100_day_streak', timestamp: new Date() });
        }
      } else if (partnerSnappedYesterday) {
        // Partner snapped yesterday, waiting for them to snap today
        streak.bothSnappedToday = false;
      } else {
        // Partner hasn't snapped in 24+ hours, streak will break
        if (streak.lastSnapDate) {
          const lastSnapDay = new Date(streak.lastSnapDate.getFullYear(), streak.lastSnapDate.getMonth(), streak.lastSnapDate.getDate());
          const daysSinceLastSnap = Math.floor((today - lastSnapDay) / (1000 * 60 * 60 * 24));
          
          if (daysSinceLastSnap > 1) {
            // Streak broken
            streak.currentStreak = 0;
            streak.bothSnappedToday = false;
          }
        }
      }

      await streak.save();

      res.json({ streak });
    } catch (error) {
      console.error('Update streak error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get love meter
router.get('/lovemeter/:partnerId', authenticateToken, async (req, res) => {
  try {
    const { partnerId } = req.params;
    const userId = req.user._id;

    const score = calculateLoveMeter(userId.toString(), partnerId);

    res.json({
      score,
      message: getLoveMeterMessage(score)
    });
  } catch (error) {
    console.error('Get love meter error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get shared album
router.get('/album/:partnerId', authenticateToken, async (req, res) => {
  try {
    const { partnerId } = req.params;
    const userId = req.user._id;

    const [user1, user2] = [userId, partnerId].sort();

    let album = await SharedAlbum.findOne({
      $or: [
        { user1, user2 },
        { user1: user2, user2: user1 }
      ]
    }).populate('photos.addedBy', 'displayName avatar');

    if (!album) {
      // Create new album
      album = new SharedAlbum({
        user1,
        user2,
        photos: []
      });
      await album.save();
    }

    res.json({ album });
  } catch (error) {
    console.error('Get album error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add photo to shared album
router.post('/album/add',
  authenticateToken,
  body('partnerId').notEmpty(),
  body('url').notEmpty(),
  body('caption').optional(),
  async (req, res) => {
    try {
      const { partnerId, url, caption } = req.body;
      const userId = req.user._id;

      const [user1, user2] = [userId, partnerId].sort();

      let album = await SharedAlbum.findOne({
        $or: [
          { user1, user2 },
          { user1: user2, user2: user1 }
        ]
      });

      if (!album) {
        album = new SharedAlbum({ user1, user2, photos: [] });
      }

      album.photos.push({
        url,
        caption: caption || '',
        addedBy: userId,
        addedAt: new Date()
      });

      await album.save();
      await album.populate('photos.addedBy', 'displayName avatar');

      res.status(201).json({
        message: 'Photo added to album',
        album
      });
    } catch (error) {
      console.error('Add to album error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get daily question prompt
router.get('/daily-question', authenticateToken, (req, res) => {
  const questions = [
    "What made you smile today? 😊",
    "What's your favorite memory of us? 💭",
    "If you could relive one day, which would it be? ⏰",
    "What are you grateful for today? 🙏",
    "What's something that reminded you of me? 💕",
    "What's your dream date idea? 🌟",
    "What song describes your mood today? 🎵",
    "What's the best thing that happened this week? ✨",
    "If we could go anywhere right now, where? 🌍",
    "What's your favorite thing about us? ❤️"
  ];

  // Use date to get consistent question for the day
  const today = new Date().toISOString().split('T')[0];
  let index = 0;
  for (let i = 0; i < today.length; i++) {
    index += today.charCodeAt(i);
  }
  index = index % questions.length;

  res.json({ question: questions[index] });
});

// Get message statistics
router.get('/stats/:partnerId', authenticateToken, async (req, res) => {
  try {
    const { partnerId } = req.params;
    const userId = req.user._id;

    const totalMessages = await Message.countDocuments({
      $or: [
        { from: userId, to: partnerId },
        { from: partnerId, to: userId }
      ]
    });

    const messagesSent = await Message.countDocuments({
      from: userId,
      to: partnerId
    });

    const messagesReceived = await Message.countDocuments({
      from: partnerId,
      to: userId
    });

    // Get first message date
    const firstMessage = await Message.findOne({
      $or: [
        { from: userId, to: partnerId },
        { from: partnerId, to: userId }
      ]
    }).sort({ createdAt: 1 });

    const daysTogether = firstMessage
      ? Math.floor((new Date() - new Date(firstMessage.createdAt)) / (1000 * 60 * 60 * 24))
      : 0;

    res.json({
      totalMessages,
      messagesSent,
      messagesReceived,
      daysTogether
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper function for love meter messages
function getLoveMeterMessage(score) {
  if (score >= 95) return "Off the charts! 🔥💕";
  if (score >= 90) return "Perfect match! ✨❤️";
  if (score >= 85) return "So in love! 💖";
  if (score >= 80) return "Super compatible! 💕";
  if (score >= 75) return "Great chemistry! 💫";
  return "Strong connection! 💗";
}

export default router;

