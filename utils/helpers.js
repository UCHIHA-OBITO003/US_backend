import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Hash password
export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

// Compare password
export const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Generate JWT token
export const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// Calculate daily love meter (random but deterministic per day)
export const calculateLoveMeter = (user1Id, user2Id, date = new Date()) => {
  const dateString = date.toISOString().split('T')[0];
  const combined = `${user1Id}${user2Id}${dateString}`;
  
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  // Convert to percentage between 70-100 (always high love! 💕)
  return 70 + (Math.abs(hash) % 31);
};

// Check if streak should be updated
export const shouldUpdateStreak = (lastMessageDate) => {
  const now = new Date();
  const last = new Date(lastMessageDate);
  
  const diffTime = Math.abs(now - last);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return {
    shouldUpdate: diffDays <= 1,
    daysPassed: diffDays
  };
};

// Get trigger words for celebration animations
export const getCelebrationTriggerWords = () => {
  return [
    'awesome',
    'amazing',
    'congrats',
    'congratulations',
    'woohoo',
    'woo',
    'yay',
    'great',
    'fantastic',
    'excellent',
    'best friend',
    'bestie',
    'legend',
    '🎉',
    '🎊',
    '✨',
    '🌟',
    '⭐',
    '🔥'
  ];
};

// Check if message contains trigger words
export const containsTriggerWord = (message) => {
  const lowerMessage = message.toLowerCase();
  return getCelebrationTriggerWords().some(word => lowerMessage.includes(word));
};

// Sanitize input to prevent XSS
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .replace(/[<>]/g, '')
    .trim();
};

