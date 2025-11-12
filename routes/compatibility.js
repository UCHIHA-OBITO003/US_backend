import express from 'express';
import { body, validationResult } from 'express-validator';
import CompatibilityQuiz from '../models/CompatibilityQuiz.js';
import CompatibilityScore from '../models/CompatibilityScore.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Create a compatibility quiz
router.post('/quiz/create',
  authenticateToken,
  body('partnerId').notEmpty(),
  body('type').isIn(['emoji', 'song', 'custom', 'truth-or-dare', 'would-you-rather', 'never-have-i']),
  body('question').notEmpty(),
  body('options').isArray({ min: 2 }),
  async (req, res) => {
    try {
      const { partnerId, type, question, options } = req.body;

      // Verify friendship
      const currentUser = await User.findById(req.user._id);
      if (!currentUser.friends.includes(partnerId)) {
        return res.status(403).json({ error: 'Can only quiz friends' });
      }

      const quiz = new CompatibilityQuiz({
        participants: [req.user._id, partnerId],
        creator: req.user._id,
        type,
        question,
        options
      });

      await quiz.save();

      res.status(201).json({
        message: 'Quiz created!',
        quiz
      });
    } catch (error) {
      console.error('Create quiz error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Submit quiz answer
router.post('/quiz/:quizId/answer',
  authenticateToken,
  body('answer').notEmpty(),
  async (req, res) => {
    try {
      const { quizId } = req.params;
      const { answer } = req.body;

      const quiz = await CompatibilityQuiz.findById(quizId);

      if (!quiz) {
        return res.status(404).json({ error: 'Quiz not found' });
      }

      // Verify user is participant
      const isParticipant = quiz.participants.some(
        p => p.toString() === req.user._id.toString()
      );

      if (!isParticipant) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Check if already answered
      const alreadyAnswered = quiz.answers.some(
        a => a.user.toString() === req.user._id.toString()
      );

      if (alreadyAnswered) {
        return res.status(400).json({ error: 'Already answered' });
      }

      // Add answer
      quiz.answers.push({
        user: req.user._id,
        answer
      });

      // Check if both answered
      if (quiz.answers.length === 2) {
        quiz.status = 'revealed';
        quiz.revealedAt = new Date();

        // Update compatibility score
        await updateCompatibilityScore(quiz);
      }

      await quiz.save();

      await quiz.populate('answers.user', 'displayName avatar');
      await quiz.populate('creator', 'displayName');

      res.json({
        quiz,
        bothAnswered: quiz.answers.length === 2
      });
    } catch (error) {
      console.error('Submit answer error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get quiz details
router.get('/quiz/:quizId', authenticateToken, async (req, res) => {
  try {
    const { quizId } = req.params;

    const quiz = await CompatibilityQuiz.findById(quizId)
      .populate('participants', 'displayName avatar')
      .populate('creator', 'displayName')
      .populate('answers.user', 'displayName avatar');

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // Verify user is participant
    const isParticipant = quiz.participants.some(
      p => p._id.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json({ quiz });
  } catch (error) {
    console.error('Get quiz error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get compatibility score
router.get('/score/:partnerId', authenticateToken, async (req, res) => {
  try {
    const { partnerId } = req.params;
    const userId = req.user._id;

    // Find score (works regardless of order)
    const score = await CompatibilityScore.findOne({
      $or: [
        { users: [userId, partnerId] },
        { users: [partnerId, userId] }
      ]
    }).populate('users', 'displayName avatar');

    if (!score) {
      return res.json({
        score: {
          totalQuizzes: 0,
          matchedAnswers: 0,
          score: 0,
          categories: {
            music: { matches: 0, total: 0 },
            personality: { matches: 0, total: 0 },
            preferences: { matches: 0, total: 0 }
          }
        }
      });
    }

    res.json({ score });
  } catch (error) {
    console.error('Get score error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get recent quizzes with partner
router.get('/quizzes/:partnerId', authenticateToken, async (req, res) => {
  try {
    const { partnerId } = req.params;
    const userId = req.user._id;

    const quizzes = await CompatibilityQuiz.find({
      participants: { $all: [userId, partnerId] },
      status: 'revealed'
    })
      .populate('creator', 'displayName')
      .populate('answers.user', 'displayName')
      .sort({ revealedAt: -1 })
      .limit(20);

    res.json({ quizzes });
  } catch (error) {
    console.error('Get quizzes error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper function to update compatibility score
async function updateCompatibilityScore(quiz) {
  try {
    const [user1, user2] = quiz.participants;
    const [answer1, answer2] = quiz.answers;

    // Find or create score document
    let score = await CompatibilityScore.findOne({
      $or: [
        { users: [user1, user2] },
        { users: [user2, user1] }
      ]
    });

    if (!score) {
      score = new CompatibilityScore({
        users: [user1, user2]
      });
    }

    // Update totals
    score.totalQuizzes += 1;

    // Check if answers match
    const matched = answer1.answer.toLowerCase().trim() === answer2.answer.toLowerCase().trim();
    if (matched) {
      score.matchedAnswers += 1;
    }

    // Calculate overall score (percentage)
    score.score = Math.round((score.matchedAnswers / score.totalQuizzes) * 100);

    // Update category scores
    const category = getCategoryFromType(quiz.type);
    if (category) {
      score.categories[category].total += 1;
      if (matched) {
        score.categories[category].matches += 1;
      }
    }

    score.lastUpdated = new Date();
    await score.save();

    return score;
  } catch (error) {
    console.error('Update compatibility score error:', error);
  }
}

function getCategoryFromType(type) {
  const categoryMap = {
    'song': 'music',
    'emoji': 'preferences',
    'custom': 'personality',
    'truth-or-dare': 'personality',
    'would-you-rather': 'preferences',
    'never-have-i': 'personality'
  };
  return categoryMap[type] || 'personality';
}

export default router;

