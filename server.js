const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const config = require('./config');
const { seedCategories } = require('./scripts/seedCategories');
const { clerkMiddleware, attachClerkAuthContext } = require('./middleware/clerkAuth');
const { initCronJobs } = require('./services/cronService');

// Load env vars
dotenv.config();

const http = require('http');
const socketService = require('./services/v1/socketService');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
socketService.init(server);

// Enable CORS for all origins and methods
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));

app.use(express.json());
app.use(clerkMiddleware);
app.use(attachClerkAuthContext);

// Routes
app.use('/v1/auth', require('./routes/v1/authRoutes'));
app.use('/v1/categories', require('./routes/v1/categoryRoutes'));
app.use('/v1/territories', require('./routes/v1/territoryRoutes'));
app.use('/v1/geofences', require('./routes/v1/geofenceRoutes'));
app.use('/v1/location', require('./routes/v1/locationRoutes'));
app.use('/v1/habits', require('./routes/v1/habitRoutes'));
app.use('/v1/doctor', require('./routes/v1/doctorRoutes'));
app.use('/v1/stats', require('./routes/v1/statsRoutes'));
app.use('/v1/coaching', require('./routes/v1/coachingRoutes'));
app.use('/v1/squads', require('./routes/v1/squadRoutes'));
app.use('/v1/validation', require('./routes/v1/validationRoutes'));
app.use('/v1/chat', require('./routes/v1/chatRoutes'));
app.use('/v1/notifications', require('./routes/v1/notificationRoutes'));

const startServer = async () => {
  try {
    await connectDB();
    await seedCategories();
    require('./services/gamificationService').seedBadges();
    initCronJobs();

    const PORT = config.PORT;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
