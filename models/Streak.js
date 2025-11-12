import mongoose from 'mongoose';

const streakSchema = new mongoose.Schema({
  user1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  user2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  currentStreak: {
    type: Number,
    default: 0
  },
  longestStreak: {
    type: Number,
    default: 0
  },
  lastSnapDate: {
    type: Date,
    default: null
  },
  user1LastSnapDate: {
    type: Date,
    default: null
  },
  user2LastSnapDate: {
    type: Date,
    default: null
  },
  bothSnappedToday: {
    type: Boolean,
    default: false
  },
  achievements: [{
    type: String,
    timestamp: Date
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for finding streak between two users
streakSchema.index({ user1: 1, user2: 1 }, { unique: true });

export default mongoose.model('Streak', streakSchema);

