import mongoose from 'mongoose';

const compatibilityScoreSchema = new mongoose.Schema({
  users: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  totalQuizzes: {
    type: Number,
    default: 0
  },
  matchedAnswers: {
    type: Number,
    default: 0
  },
  score: {
    type: Number,
    default: 0
  },
  categories: {
    music: {
      matches: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },
    personality: {
      matches: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },
    preferences: {
      matches: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    }
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Ensure only one score document per pair
compatibilityScoreSchema.index({ users: 1 }, { unique: true });

export default mongoose.model('CompatibilityScore', compatibilityScoreSchema);

