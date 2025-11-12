import mongoose from 'mongoose';

const storySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  mediaUrl: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['image', 'video'],
    required: true
  },
  caption: {
    type: String,
    default: ''
  },
  views: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    viewedAt: {
      type: Date,
      default: Date.now
    }
  }],
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // Auto-delete when expired
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient queries
storySchema.index({ user: 1, createdAt: -1 });
storySchema.index({ expiresAt: 1 });

export default mongoose.model('Story', storySchema);

