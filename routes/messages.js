import express from 'express';
import { body, validationResult } from 'express-validator';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import { sanitizeInput, containsTriggerWord } from '../utils/helpers.js';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|m4a|mp3|wav/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Get conversation with a user (only if friends)
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    // Check if users are friends
    const currentUser = await User.findById(currentUserId);
    if (!currentUser.friends.includes(userId)) {
      return res.status(403).json({ error: 'You can only message friends' });
    }

    // Only return non-expired messages (snaps that haven't been viewed or deleted)
    // CRITICAL FIX: Use $and to combine both conditions properly
    const messages = await Message.find({
      $and: [
        {
          $or: [
            { from: currentUserId, to: userId },
            { from: userId, to: currentUserId }
          ]
        },
        {
          $or: [
            { isSnap: false }, // Regular messages
            { isSnap: true, viewedAt: null }, // Unviewed snaps
            { isSnap: true, expiresAt: { $gt: new Date() } } // Snaps not yet expired
          ]
        }
      ]
    })
      .populate('from', 'displayName avatar')
      .populate('to', 'displayName avatar')
      .sort({ createdAt: 1 })
      .limit(100);

    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send message (only to friends)
router.post('/send',
  authenticateToken,
  body('to').notEmpty(),
  body('content').optional(),
  body('isSnap').optional().isBoolean(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { to, content, type = 'text', mediaUrl = '', isSnap = false } = req.body;

      // Check if users are friends
      const currentUser = await User.findById(req.user._id);
      if (!currentUser.friends.includes(to)) {
        return res.status(403).json({ error: 'You can only message friends' });
      }

      const message = new Message({
        from: req.user._id,
        to,
        content: sanitizeInput(content || ''),
        type,
        mediaUrl,
        isSnap
      });

      // If it's a snap, set it to delete after 24 hours OR after being viewed once
      if (isSnap) {
        const expiryDate = new Date();
        expiryDate.setHours(expiryDate.getHours() + 24);
        message.expiresAt = expiryDate;
      }

      await message.save();
      await message.populate('from', 'displayName avatar snapScore');
      await message.populate('to', 'displayName avatar snapScore');

      // Increase snap score if it's a snap
      if (isSnap) {
        await User.findByIdAndUpdate(req.user._id, {
          $inc: { snapScore: 1 }
        });
      }

      // Check if message contains trigger words
      const triggersHearts = type === 'text' && containsTriggerWord(content);

      res.status(201).json({
        message,
        triggersHearts
      });
    } catch (error) {
      console.error('Send message error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Upload media
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let mediaUrl = `/uploads/${req.file.filename}`;

    // Optimize images with sharp
    if (req.file.mimetype.startsWith('image/')) {
      const optimizedFilename = `optimized-${req.file.filename}`;
      const optimizedPath = path.join(__dirname, '../uploads', optimizedFilename);

      await sharp(req.file.path)
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(optimizedPath);

      // Delete original and use optimized
      fs.unlinkSync(req.file.path);
      mediaUrl = `/uploads/${optimizedFilename}`;
    }

    res.json({ mediaUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Mark message as read/viewed (for snaps, they delete immediately after viewing)
router.put('/:messageId/read', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.to.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    message.isRead = true;
    message.readAt = new Date();

    // For snaps, mark as viewed and delete immediately (or after 10 seconds)
    if (message.isSnap) {
      message.viewedAt = new Date();
      
      // Delete snap immediately after viewing (Snapchat behavior)
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + 10); // 10 seconds to view
      message.expiresAt = expiryDate;

      // Increase snap score for receiver
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { snapScore: 1 }
      });
    }

    await message.save();

    res.json({ 
      message: 'Message marked as read', 
      expiresAt: message.expiresAt,
      isSnap: message.isSnap,
      viewingTime: message.isSnap ? 10 : null // seconds
    });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete message
router.delete('/:messageId', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Only sender can delete
    if (message.from.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await Message.findByIdAndDelete(messageId);

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add reaction to message
router.post('/:messageId/react', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if user already reacted
    const existingReaction = message.reactions.find(
      r => r.userId.toString() === req.user._id.toString()
    );

    if (existingReaction) {
      // Update existing reaction
      existingReaction.emoji = emoji;
      existingReaction.timestamp = new Date();
    } else {
      // Add new reaction
      message.reactions.push({
        userId: req.user._id,
        emoji,
        timestamp: new Date()
      });
    }

    await message.save();

    res.json({ message: 'Reaction added', reactions: message.reactions });
  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Schedule message
router.post('/schedule',
  authenticateToken,
  body('to').notEmpty(),
  body('content').notEmpty(),
  body('scheduledFor').isISO8601(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { to, content, scheduledFor } = req.body;

      const scheduledDate = new Date(scheduledFor);
      if (scheduledDate <= new Date()) {
        return res.status(400).json({ error: 'Scheduled time must be in the future' });
      }

      const message = new Message({
        from: req.user._id,
        to,
        content: sanitizeInput(content),
        isScheduled: true,
        scheduledFor: scheduledDate
      });

      await message.save();

      res.status(201).json({
        message: 'Message scheduled successfully',
        scheduledMessage: message
      });
    } catch (error) {
      console.error('Schedule message error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

export default router;

