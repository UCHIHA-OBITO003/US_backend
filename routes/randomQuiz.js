import express from 'express';
import CompatibilityQuiz from '../models/CompatibilityQuiz.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Random questions pool
const randomQuestions = [
  {
    type: 'would-you-rather',
    question: 'Would you rather...',
    options: ['Have the ability to fly', 'Be invisible']
  },
  {
    type: 'would-you-rather',
    question: 'Would you rather...',
    options: ['Live without music', 'Live without movies']
  },
  {
    type: 'would-you-rather',
    question: 'Would you rather...',
    options: ['Be able to speak all languages', 'Talk to animals']
  },
  {
    type: 'would-you-rather',
    question: 'Would you rather...',
    options: ['Time travel to the past', 'Time travel to the future']
  },
  {
    type: 'would-you-rather',
    question: 'Would you rather...',
    options: ['Have unlimited money', 'Have unlimited free time']
  },
  {
    type: 'emoji',
    question: 'How are you feeling right now?',
    options: ['😊', '😎', '🥳', '😌', '🤔', '😴']
  },
  {
    type: 'custom',
    question: "What's your favorite late-night snack?",
    options: ['Pizza', 'Ice Cream', 'Chips', 'Fruit', 'Nothing']
  },
  {
    type: 'custom',
    question: "What's keeping you up tonight?",
    options: ['Can\'t sleep', 'Work/Study', 'Just chilling', 'Watching something', 'Thinking']
  },
  {
    type: 'custom',
    question: 'What would you do with a million dollars?',
    options: ['Travel the world', 'Buy a house', 'Invest it', 'Give to charity', 'Save it']
  },
  {
    type: 'custom',
    question: 'What superpower would you want?',
    options: ['Flying', 'Invisibility', 'Time travel', 'Mind reading', 'Super strength']
  }
];

// Send random question to both users
router.post('/send-random', authenticateToken, async (req, res) => {
  try {
    const { partnerId } = req.body;

    // Verify friendship
    const currentUser = await User.findById(req.user._id);
    if (!currentUser.friends.includes(partnerId)) {
      return res.status(403).json({ error: 'Can only send to friends' });
    }

    // Get random question
    const randomQuestion = randomQuestions[Math.floor(Math.random() * randomQuestions.length)];

    // Create quiz for both users
    const quiz = new CompatibilityQuiz({
      participants: [req.user._id, partnerId],
      creator: req.user._id,
      type: randomQuestion.type,
      question: randomQuestion.question,
      options: randomQuestion.options,
      isRandom: true
    });

    await quiz.save();

    res.json({
      message: 'Random question sent!',
      quiz
    });
  } catch (error) {
    console.error('Send random quiz error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

