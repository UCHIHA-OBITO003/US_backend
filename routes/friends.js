import express from 'express';
import { body, validationResult } from 'express-validator';
import FriendRequest from '../models/FriendRequest.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Send friend request
router.post('/request/send',
  authenticateToken,
  body('toUserId').notEmpty(),
  async (req, res) => {
    try {
      const { toUserId } = req.body;
      const fromUserId = req.user._id;

      // Can't send request to yourself
      if (fromUserId.toString() === toUserId) {
        return res.status(400).json({ error: "Can't send friend request to yourself" });
      }

      // Check if user exists
      const toUser = await User.findById(toUserId);
      if (!toUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if already friends
      const currentUser = await User.findById(fromUserId);
      if (currentUser.friends.includes(toUserId)) {
        return res.status(400).json({ error: 'Already friends' });
      }

      // Check if request already exists
      const existingRequest = await FriendRequest.findOne({
        $or: [
          { from: fromUserId, to: toUserId },
          { from: toUserId, to: fromUserId }
        ]
      });

      if (existingRequest) {
        if (existingRequest.status === 'pending') {
          return res.status(400).json({ error: 'Friend request already sent' });
        } else if (existingRequest.status === 'rejected') {
          // Allow resending after rejection
          existingRequest.status = 'pending';
          existingRequest.from = fromUserId;
          existingRequest.to = toUserId;
          existingRequest.createdAt = new Date();
          existingRequest.respondedAt = null;
          await existingRequest.save();
          
          return res.json({ 
            message: 'Friend request sent', 
            request: existingRequest 
          });
        }
      }

      // Create new friend request
      const friendRequest = new FriendRequest({
        from: fromUserId,
        to: toUserId
      });

      await friendRequest.save();
      await friendRequest.populate('from', 'username displayName avatar');
      await friendRequest.populate('to', 'username displayName avatar');

      res.status(201).json({
        message: 'Friend request sent',
        request: friendRequest
      });
    } catch (error) {
      console.error('Send friend request error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get pending friend requests (received)
router.get('/requests/pending', authenticateToken, async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      to: req.user._id,
      status: 'pending'
    })
      .populate('from', 'username displayName avatar snapScore')
      .sort({ createdAt: -1 });

    res.json({ requests });
  } catch (error) {
    console.error('Get pending requests error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get sent friend requests
router.get('/requests/sent', authenticateToken, async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      from: req.user._id,
      status: 'pending'
    })
      .populate('to', 'username displayName avatar snapScore')
      .sort({ createdAt: -1 });

    res.json({ requests });
  } catch (error) {
    console.error('Get sent requests error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Accept friend request
router.post('/request/accept',
  authenticateToken,
  body('requestId').notEmpty(),
  async (req, res) => {
    try {
      const { requestId } = req.body;

      const friendRequest = await FriendRequest.findById(requestId);

      if (!friendRequest) {
        return res.status(404).json({ error: 'Friend request not found' });
      }

      if (friendRequest.to.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      if (friendRequest.status !== 'pending') {
        return res.status(400).json({ error: 'Request already processed' });
      }

      // Update request status
      friendRequest.status = 'accepted';
      friendRequest.respondedAt = new Date();
      await friendRequest.save();

      // Add to friends list for both users
      await User.findByIdAndUpdate(friendRequest.from, {
        $addToSet: { friends: friendRequest.to }
      });

      await User.findByIdAndUpdate(friendRequest.to, {
        $addToSet: { friends: friendRequest.from }
      });

      await friendRequest.populate('from', 'username displayName avatar snapScore');

      // Notify via socket (handled in socket handler)
      res.json({
        message: 'Friend request accepted',
        friend: friendRequest.from,
        senderId: friendRequest.from._id,
        acceptorId: req.user._id,
        acceptorName: req.user.displayName
      });
    } catch (error) {
      console.error('Accept friend request error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Reject friend request
router.post('/request/reject',
  authenticateToken,
  body('requestId').notEmpty(),
  async (req, res) => {
    try {
      const { requestId } = req.body;

      const friendRequest = await FriendRequest.findById(requestId);

      if (!friendRequest) {
        return res.status(404).json({ error: 'Friend request not found' });
      }

      if (friendRequest.to.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      friendRequest.status = 'rejected';
      friendRequest.respondedAt = new Date();
      await friendRequest.save();

      res.json({ message: 'Friend request rejected' });
    } catch (error) {
      console.error('Reject friend request error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get friends list
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('friends', 'username displayName avatar currentMood isOnline lastSeen snapScore');

    res.json({ friends: user.friends });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove friend
router.delete('/remove/:friendId', authenticateToken, async (req, res) => {
  try {
    const { friendId } = req.params;
    const userId = req.user._id;

    // Remove from both users' friend lists
    await User.findByIdAndUpdate(userId, {
      $pull: { friends: friendId }
    });

    await User.findByIdAndUpdate(friendId, {
      $pull: { friends: userId }
    });

    // Delete friend request record
    await FriendRequest.deleteOne({
      $or: [
        { from: userId, to: friendId },
        { from: friendId, to: userId }
      ]
    });

    res.json({ message: 'Friend removed' });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check friendship status
router.get('/status/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    const user = await User.findById(currentUserId);
    const isFriend = user.friends.includes(userId);

    if (isFriend) {
      return res.json({ status: 'friends' });
    }

    // Check for pending request
    const pendingRequest = await FriendRequest.findOne({
      $or: [
        { from: currentUserId, to: userId, status: 'pending' },
        { from: userId, to: currentUserId, status: 'pending' }
      ]
    });

    if (pendingRequest) {
      if (pendingRequest.from.toString() === currentUserId.toString()) {
        return res.json({ status: 'request_sent', requestId: pendingRequest._id });
      } else {
        return res.json({ status: 'request_received', requestId: pendingRequest._id });
      }
    }

    res.json({ status: 'none' });
  } catch (error) {
    console.error('Check friendship status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

