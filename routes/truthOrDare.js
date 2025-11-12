import express from 'express';
import CompatibilityQuiz from '../models/CompatibilityQuiz.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

const truths = [
  "What's your biggest fear?",
  "What's the most embarrassing thing you've done?",
  "Who was your first crush?",
  "What's a secret you've never told anyone?",
  "What's your biggest regret?",
  "What's the weirdest dream you've ever had?",
  "What's something you're ashamed of?",
  "Who do you have a crush on right now?",
  "What's the biggest lie you've ever told?",
  "What's your guilty pleasure?",
  "What's something you're afraid to admit?",
  "What's the worst thing you've done?",
  "What's your most embarrassing moment?",
  "What's something you wish you could change about yourself?",
  "What's your darkest secret?"
];

const dares = [
  "Do 20 push-ups right now",
  "Post an embarrassing photo on social media",
  "Text your crush 'I like you'",
  "Eat a spoonful of hot sauce",
  "Dance with no music for 1 minute",
  "Call a random contact and sing to them",
  "Do your best celebrity impression",
  "Speak in an accent for the next 10 minutes",
  "Let someone else read your last 5 text messages",
  "Post a story saying 'I'm bored, someone entertain me'",
  "Send a screenshot of your search history",
  "Call your mom and tell her you love her",
  "Do 50 jumping jacks",
  "Sing your favorite song out loud",
  "Do your best dance move"
];

// Create Truth or Dare quiz
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { partnerId, choice } = req.body; // choice: 'truth' or 'dare'

    // Verify friendship
    const currentUser = await User.findById(req.user._id);
    if (!currentUser.friends.includes(partnerId)) {
      return res.status(403).json({ error: 'Can only send to friends' });
    }

    let question, options;
    
    if (choice === 'truth') {
      question = truths[Math.floor(Math.random() * truths.length)];
      options = ['Yes', 'No', 'Maybe', 'I prefer not to answer'];
    } else {
      question = dares[Math.floor(Math.random() * dares.length)];
      options = ['Did it! ✓', 'Skip 😅', 'Maybe later', 'Challenge accepted!'];
    }

    const quiz = new CompatibilityQuiz({
      participants: [req.user._id, partnerId],
      creator: req.user._id,
      type: 'truth-or-dare',
      question: `${choice === 'truth' ? 'TRUTH' : 'DARE'}: ${question}`,
      options: options,
      truthOrDareChoice: choice
    });

    await quiz.save();

    res.json({
      message: `${choice === 'truth' ? 'Truth' : 'Dare'} sent!`,
      quiz
    });
  } catch (error) {
    console.error('Create truth or dare error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

