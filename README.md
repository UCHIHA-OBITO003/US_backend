# Private Chat App - Backend

A secure, feature-rich backend for a private messaging web application with real-time communication, disappearing messages, and cute love-themed features.

## Features

- 🔐 Secure authentication with JWT
- 💬 Real-time messaging via Socket.io
- 🔥 Disappearing messages (auto-delete after reading)
- 📸 Media sharing (images, videos, audio)
- ❤️ Love meter & streak tracking
- 🎵 Voice messages
- 👀 Read receipts & typing indicators
- 🎭 Message reactions
- 📅 Scheduled messages
- 🖼️ Shared photo album

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file (use `.env.example` as template):
```bash
cp .env.example .env
```

3. Update `.env` with your configuration:
- MongoDB connection string
- JWT secret
- Redis URL (optional, for session management)

4. Start MongoDB locally or use MongoDB Atlas

5. Run the server:
```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/verify` - Verify token

### Messages
- `GET /api/messages/:userId` - Get conversation
- `POST /api/messages/send` - Send message
- `POST /api/messages/upload` - Upload media
- `PUT /api/messages/:messageId/read` - Mark as read
- `DELETE /api/messages/:messageId` - Delete message
- `POST /api/messages/:messageId/react` - Add reaction
- `POST /api/messages/schedule` - Schedule message

### User
- `GET /api/user/profile` - Get profile
- `PUT /api/user/profile` - Update profile
- `PUT /api/user/mood` - Update mood
- `PUT /api/user/theme` - Update theme
- `PUT /api/user/passcode` - Set passcode
- `PUT /api/user/biometric` - Toggle biometric
- `GET /api/user/search` - Search users
- `GET /api/user/:userId` - Get user by ID

### Special Features
- `GET /api/special/streak/:partnerId` - Get streak
- `POST /api/special/streak/update` - Update streak
- `GET /api/special/lovemeter/:partnerId` - Get love meter
- `GET /api/special/album/:partnerId` - Get shared album
- `POST /api/special/album/add` - Add to album
- `GET /api/special/daily-question` - Get daily question
- `GET /api/special/stats/:partnerId` - Get statistics

## WebSocket Events

### Client → Server
- `send_message` - Send new message
- `typing_start` - User started typing
- `typing_stop` - User stopped typing
- `message_read` - Mark message as read
- `add_reaction` - Add reaction to message
- `screenshot_taken` - Notify screenshot taken
- `call_user` - Initiate voice/video call
- `answer_call` - Answer call
- `ice_candidate` - WebRTC ICE candidate
- `end_call` - End call

### Server → Client
- `new_message` - Receive new message
- `message_sent` - Message sent confirmation
- `message_delivered` - Message delivered
- `message_read_receipt` - Message read receipt
- `user_typing` - Other user typing
- `user_stopped_typing` - Other user stopped typing
- `user_online` - User came online
- `user_offline` - User went offline
- `hearts_trigger` - Trigger heart animation
- `partner_screenshot` - Partner took screenshot
- `reaction_added` - Reaction added to message
- `incoming_call` - Incoming call
- `call_answered` - Call answered
- `call_ended` - Call ended

## Security Features

- Password hashing with bcryptjs
- JWT authentication
- Rate limiting
- Input sanitization
- CORS protection
- Helmet security headers
- File upload validation
- Secure cookie handling

## Database Schema

### User
- username (unique)
- passwordHash
- displayName
- avatar
- currentMood
- theme
- passcode
- biometricEnabled
- isOnline
- lastSeen

### Message
- from (User ref)
- to (User ref)
- content
- type (text/image/video/audio/sticker)
- mediaUrl
- isRead
- readAt
- expiresAt (auto-delete)
- reactions
- scheduledFor

### Streak
- user1 (User ref)
- user2 (User ref)
- currentStreak
- longestStreak
- lastMessageDate
- achievements

### SharedAlbum
- user1 (User ref)
- user2 (User ref)
- photos [{url, caption, addedBy, addedAt}]

## Environment Variables

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/private-chat
JWT_SECRET=your_secret_key
JWT_EXPIRE=7d
REDIS_URL=redis://localhost:6379
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads
```

## Deployment

Recommended platforms:
- **Railway** - Easy deployment with MongoDB add-on
- **Render** - Free tier available
- **DigitalOcean** - App Platform
- **Heroku** - With MongoDB Atlas

## License

MIT

