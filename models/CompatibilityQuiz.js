import mongoose from 'mongoose';

const compatibilityQuizSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['emoji', 'song', 'custom', 'truth-or-dare', 'would-you-rather', 'never-have-i'],
    required: true
  },
  question: {
    type: String,
    required: true
  },
  options: [{
    type: String
  }],
  answers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    answer: String,
    answeredAt: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: ['waiting', 'revealed', 'expired'],
    default: 'waiting'
  },
  revealedAt: Date,
  isRandom: {
    type: Boolean,
    default: false
  },
  truthOrDareChoice: {
    type: String,
    enum: ['truth', 'dare'],
    default: null
  },
  expiresAt: {
    type: Date,
    // Expires after 24 hours if not answered
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000)
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for auto-expiration
compatibilityQuizSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('CompatibilityQuiz', compatibilityQuizSchema);

