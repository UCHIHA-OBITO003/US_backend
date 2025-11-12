import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Message from '../models/Message.js';
import CompatibilityQuiz from '../models/CompatibilityQuiz.js';

const userSockets = new Map(); // Map userId to socketId

export const initializeSocket = (io) => {
  // Socket authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);

      if (!user) {
        return next(new Error('User not found'));
      }

      socket.userId = user._id.toString();
      socket.userData = {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar
      };

      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.userData.displayName} (${socket.userId})`);

    // Store socket mapping
    userSockets.set(socket.userId, socket.id);

    // Update user online status
    User.findByIdAndUpdate(socket.userId, {
      isOnline: true,
      lastSeen: new Date()
    }).catch(err => console.error('Update online status error:', err));

    // Notify contacts that user is online
    socket.broadcast.emit('user_online', {
      userId: socket.userId,
      ...socket.userData
    });

    // Join personal room
    socket.join(socket.userId);

    // Handle send message (only to friends)
    socket.on('send_message', async (data) => {
      try {
        const { to, content, type, mediaUrl, isSnap } = data;

        // Check if users are friends
        const currentUser = await User.findById(socket.userId);
        if (!currentUser.friends.includes(to)) {
          socket.emit('message_error', { error: 'You can only message friends' });
          return;
        }

        // Create message in database
        const message = new Message({
          from: socket.userId,
          to,
          content: content || '',
          type: type || 'text',
          mediaUrl: mediaUrl || '',
          isSnap: isSnap || false
        });

        // If it's a snap, set it to expire
        if (isSnap) {
          const expiryDate = new Date();
          expiryDate.setHours(expiryDate.getHours() + 24);
          message.expiresAt = expiryDate;
          
          // Increase snap score
          await User.findByIdAndUpdate(socket.userId, {
            $inc: { snapScore: 1 }
          });
        }

        await message.save();
        await message.populate('from', 'displayName avatar snapScore');
        await message.populate('to', 'displayName avatar snapScore');

        // Send to recipient if online
        const recipientSocketId = userSockets.get(to);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('new_message', message);
          
          // Send delivery confirmation
          socket.emit('message_delivered', {
            messageId: message._id,
            deliveredAt: new Date()
          });
        }

        // Send back to sender with confirmation
        socket.emit('message_sent', message);

        console.log(`💬 Message sent from ${socket.userData.displayName} to user ${to}`);

        // Check for celebration triggers (only for regular messages, not snaps)
        if (!isSnap && type === 'text' && content) {
          const lowerContent = content.toLowerCase();
          const triggerWords = ['awesome', 'amazing', 'congrats', 'woohoo', 'yay', 'great', 'fantastic', 'excellent', '🎉', '🎊', '✨', '🌟', '⭐', '🔥'];
          
          if (triggerWords.some(word => lowerContent.includes(word))) {
            // Trigger celebration animation for both users
            socket.emit('celebration_trigger');
            if (recipientSocketId) {
              io.to(recipientSocketId).emit('celebration_trigger');
            }
          }
        }
      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('message_error', { error: 'Failed to send message' });
      }
    });

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      const { to } = data;
      const recipientSocketId = userSockets.get(to);
      
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('user_typing', {
          userId: socket.userId,
          ...socket.userData
        });
      }
    });

    socket.on('typing_stop', (data) => {
      const { to } = data;
      const recipientSocketId = userSockets.get(to);
      
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('user_stopped_typing', {
          userId: socket.userId
        });
      }
    });

    // Handle message read
    socket.on('message_read', async (data) => {
      try {
        const { messageId, senderId } = data;

        const message = await Message.findById(messageId);
        if (message && message.to.toString() === socket.userId) {
          message.isRead = true;
          message.readAt = new Date();
          
          // Set auto-delete after 24 hours
          const expiryDate = new Date();
          expiryDate.setHours(expiryDate.getHours() + 24);
          message.expiresAt = expiryDate;
          
          await message.save();

          // Notify sender
          const senderSocketId = userSockets.get(senderId);
          if (senderSocketId) {
            io.to(senderSocketId).emit('message_read_receipt', {
              messageId,
              readAt: message.readAt
            });
          }
        }
      } catch (error) {
        console.error('Message read error:', error);
      }
    });

    // Handle screenshot detection notification
    socket.on('screenshot_taken', (data) => {
      const { partnerId } = data;
      const partnerSocketId = userSockets.get(partnerId);
      
      if (partnerSocketId) {
        io.to(partnerSocketId).emit('partner_screenshot', {
          userId: socket.userId,
          timestamp: new Date(),
          message: `${socket.userData.displayName} took a screenshot`
        });
      }
    });

    // Handle reactions
    socket.on('add_reaction', async (data) => {
      try {
        const { messageId, emoji, partnerId } = data;

        const message = await Message.findById(messageId);
        if (message) {
          const existingReaction = message.reactions.find(
            r => r.userId.toString() === socket.userId
          );

          if (existingReaction) {
            existingReaction.emoji = emoji;
            existingReaction.timestamp = new Date();
          } else {
            message.reactions.push({
              userId: socket.userId,
              emoji,
              timestamp: new Date()
            });
          }

          await message.save();

          // Notify partner
          const partnerSocketId = userSockets.get(partnerId);
          if (partnerSocketId) {
            io.to(partnerSocketId).emit('reaction_added', {
              messageId,
              userId: socket.userId,
              emoji,
              reactions: message.reactions
            });
          }

          socket.emit('reaction_confirmed', {
            messageId,
            reactions: message.reactions
          });
        }
      } catch (error) {
        console.error('Add reaction error:', error);
      }
    });

    // Handle voice call signaling
    socket.on('call_user', (data) => {
      const { to, offer } = data;
      const recipientSocketId = userSockets.get(to);
      
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('incoming_call', {
          from: socket.userId,
          fromData: socket.userData,
          offer
        });
      }
    });

    socket.on('answer_call', (data) => {
      const { to, answer } = data;
      const callerSocketId = userSockets.get(to);
      
      if (callerSocketId) {
        io.to(callerSocketId).emit('call_answered', {
          from: socket.userId,
          answer
        });
      }
    });

    socket.on('ice_candidate', (data) => {
      const { to, candidate } = data;
      const recipientSocketId = userSockets.get(to);
      
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('ice_candidate', {
          from: socket.userId,
          candidate
        });
      }
    });

    socket.on('end_call', (data) => {
      const { to } = data;
      const recipientSocketId = userSockets.get(to);
      
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('call_ended', {
          from: socket.userId
        });
      }
    });

    // Handle poke
    socket.on('send_poke', async (data) => {
      try {
        const { to } = data;

        // Check if users are friends
        const currentUser = await User.findById(socket.userId);
        if (!currentUser.friends.includes(to)) {
          socket.emit('poke_error', { error: 'You can only poke friends' });
          return;
        }

        const recipientSocketId = userSockets.get(to);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('receive_poke', {
            from: socket.userId,
            fromName: socket.userData.displayName,
            timestamp: new Date()
          });

          socket.emit('poke_sent', { to });
        } else {
          socket.emit('poke_error', { error: 'User is offline' });
        }
      } catch (error) {
        console.error('Send poke error:', error);
        socket.emit('poke_error', { error: 'Failed to send poke' });
      }
    });

    // Handle friend request accepted notification
    socket.on('friend_request_accepted', (data) => {
      const { to, friendName } = data;
      const recipientSocketId = userSockets.get(to);
      
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('friend_request_accepted', {
          friendName: friendName,
          timestamp: new Date()
        });
      }
    });

    // Compatibility quiz events
    socket.on('send_quiz', async (data) => {
      try {
        const { to, quizId } = data;

        const quiz = await CompatibilityQuiz.findById(quizId)
          .populate('creator', 'displayName avatar');

        if (!quiz) {
          socket.emit('quiz_error', { error: 'Quiz not found' });
          return;
        }

        const recipientSocketId = userSockets.get(to);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('new_quiz', {
            quiz: {
              _id: quiz._id,
              type: quiz.type,
              question: quiz.question,
              options: quiz.options,
              creator: quiz.creator,
              truthOrDareChoice: quiz.truthOrDareChoice,
              isRandom: quiz.isRandom
            }
          });

          socket.emit('quiz_sent', { quizId });
        } else {
          socket.emit('quiz_error', { error: 'User is offline' });
        }
      } catch (error) {
        console.error('Send quiz error:', error);
        socket.emit('quiz_error', { error: 'Failed to send quiz' });
      }
    });

    socket.on('quiz_answered', async (data) => {
      try {
        const { quizId, partnerId } = data;

        const quiz = await CompatibilityQuiz.findById(quizId)
          .populate('answers.user', 'displayName avatar');

        if (!quiz) {
          return;
        }

        // If both answered, notify both users to reveal
        if (quiz.answers.length === 2) {
          const user1SocketId = userSockets.get(quiz.participants[0].toString());
          const user2SocketId = userSockets.get(quiz.participants[1].toString());

          const revealData = {
            quizId,
            question: quiz.question,
            answers: quiz.answers,
            matched: quiz.answers[0].answer.toLowerCase().trim() === quiz.answers[1].answer.toLowerCase().trim()
          };

          // Emit to both users simultaneously
          if (user1SocketId) {
            io.to(user1SocketId).emit('quiz_reveal', revealData);
          }
          if (user2SocketId) {
            io.to(user2SocketId).emit('quiz_reveal', revealData);
          }
        } else {
          // Notify the OTHER user (not the one who just answered) that their partner answered
          // Find who didn't answer yet
          const answeredUserId = socket.userId;
          const otherParticipant = quiz.participants.find(p => p.toString() !== answeredUserId);
          
          if (otherParticipant) {
            const otherSocketId = userSockets.get(otherParticipant.toString());
            if (otherSocketId) {
              io.to(otherSocketId).emit('quiz_partner_answered', { 
                quizId,
                partnerName: socket.userData.displayName
              });
            }
          }
        }
      } catch (error) {
        console.error('Quiz answered error:', error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log(`❌ User disconnected: ${socket.userData.displayName}`);

      // Remove socket mapping
      userSockets.delete(socket.userId);

      // Update user offline status
      await User.findByIdAndUpdate(socket.userId, {
        isOnline: false,
        lastSeen: new Date()
      }).catch(err => console.error('Update offline status error:', err));

      // Notify contacts that user is offline
      socket.broadcast.emit('user_offline', {
        userId: socket.userId,
        lastSeen: new Date()
      });
    });
  });

  console.log('✅ Socket.io initialized');
};

