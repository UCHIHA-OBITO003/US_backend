import mongoose from 'mongoose';

const memorySchema = new mongoose.Schema({
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
  isPrivate: {
    type: Boolean,
    default: false // 'My Eyes Only'
  },
  originalSnapDate: {
    type: Date,
    default: Date.now
  },
  tags: [{
    type: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient queries
memorySchema.index({ user: 1, createdAt: -1 });
memorySchema.index({ user: 1, isPrivate: 1 });

export default mongoose.model('Memory', memorySchema);

