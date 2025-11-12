import express from 'express';
import AnonymousChat from '../models/AnonymousChat.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Generate random anonymous name
const generateAnonymousName = () => {
  const adjectives = [
    'Mysterious', 'Cosmic', 'Dreamy', 'Starry', 'Lunar', 'Midnight', 
    'Twilight', 'Shadow', 'Silent', 'Whispering', 'Wandering', 'Lost',
    'Sleepless', 'Nocturnal', 'Evening', 'Phantom', 'Ghost', 'Spirit'
  ];
  
  const nouns = [
    'Owl', 'Moon', 'Star', 'Night', 'Dream', 'Soul', 'Traveler',
    'Thinker', 'Wanderer', 'Seeker', 'Mind', 'Spirit', 'Heart',
    'Voice', 'Whisper', 'Echo', 'Shadow', 'Light'
  ];
  
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 999) + 1;
  
  return `${adj}${noun}${num}`;
};

// Join anonymous chat queue
router.post('/join-queue', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Check if user is already in a chat
    const existingChat = await AnonymousChat.findOne({
      'participants.userId': userId,
      status: { $in: ['waiting', 'active'] }
    });
    
    if (existingChat) {
      return res.status(400).json({ 
        error: 'You are already in a chat or waiting' 
      });
    }
    
    // Find waiting chat
    const waitingChat = await AnonymousChat.findOne({
      status: 'waiting',
      'participants.userId': { $ne: userId } // Don't match with self
    });
    
    if (waitingChat) {
      // Match found! Join existing chat
      const anonymousName = generateAnonymousName();
      
      waitingChat.participants.push({
        userId,
        anonymousName
      });
      
      waitingChat.status = 'active';
      waitingChat.startedAt = new Date();
      
      // 10 minute timer
      const endsAt = new Date();
      endsAt.setMinutes(endsAt.getMinutes() + 10);
      waitingChat.endsAt = endsAt;
      
      await waitingChat.save();
      
      res.json({
        matched: true,
        chatId: waitingChat._id,
        anonymousName,
        endsAt
      });
    } else {
      // No match, create new waiting chat
      const anonymousName = generateAnonymousName();
      
      const newChat = new AnonymousChat({
        participants: [{
          userId,
          anonymousName
        }],
        status: 'waiting'
      });
      
      await newChat.save();
      
      res.json({
        matched: false,
        chatId: newChat._id,
        anonymousName,
        waiting: true
      });
    }
  } catch (error) {
    console.error('Join queue error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Leave queue
router.post('/leave-queue', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    await AnonymousChat.deleteOne({
      'participants.userId': userId,
      status: 'waiting',
      'participants': { $size: 1 }
    });
    
    res.json({ message: 'Left queue' });
  } catch (error) {
    console.error('Leave queue error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get chat details
router.get('/chat/:chatId', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;
    
    const chat = await AnonymousChat.findById(chatId);
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    // Verify user is participant
    const isParticipant = chat.participants.some(
      p => p.userId.toString() === userId.toString()
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Get own anonymous name and partner's
    const self = chat.participants.find(
      p => p.userId.toString() === userId.toString()
    );
    
    const partner = chat.participants.find(
      p => p.userId.toString() !== userId.toString()
    );
    
    res.json({
      chat: {
        _id: chat._id,
        status: chat.status,
        startedAt: chat.startedAt,
        endsAt: chat.endsAt,
        messages: chat.messages,
        selfName: self?.anonymousName,
        partnerName: partner?.anonymousName || 'Waiting...'
      }
    });
  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// End chat
router.post('/end-chat/:chatId', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;
    
    const chat = await AnonymousChat.findById(chatId);
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    // Verify user is participant
    const isParticipant = chat.participants.some(
      p => p.userId.toString() === userId.toString()
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    chat.status = 'ended';
    chat.endedAt = new Date();
    await chat.save();
    
    res.json({ message: 'Chat ended' });
  } catch (error) {
    console.error('End chat error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get random conversation starters
router.get('/conversation-starters', authenticateToken, (req, res) => {
  const starters = [
    "What's keeping you up tonight?",
    "If you could travel anywhere right now, where would you go?",
    "What's your favorite late-night snack?",
    "What's the last thing that made you laugh?",
    "If you could have dinner with anyone, who would it be?",
    "What's your guilty pleasure?",
    "What's the best advice you've ever received?",
    "If you could learn any skill instantly, what would it be?",
    "What's your favorite movie or show right now?",
    "What's something you're grateful for today?",
    "What's your dream job?",
    "If you could live in any era, which would you choose?",
    "What's your biggest fear?",
    "What makes you feel most alive?",
    "What's something nobody knows about you?",
    "What's your favorite memory?",
    "If you won the lottery, what's the first thing you'd do?",
    "What's your biggest accomplishment?",
    "What are you passionate about?",
    "What's your favorite song right now?"
  ];
  
  // Return 5 random starters
  const shuffled = starters.sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 5);
  
  res.json({ starters: selected });
});

export default router;

