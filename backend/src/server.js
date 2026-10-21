const dotenv = require('dotenv');
const path = require('path');

// Support .env in backend/ directory or root directory
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

const app = require('./app');
const connectDB = require('./config/db');
const { startRecoveryWorker, stopRecoveryWorker } = require('./services/recoveryWorker');

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

const startServer = async () => {
  try {
    await connectDB();
    // Start background recovery worker for retry_pending jobs (recovers jobs on restart)
    await startRecoveryWorker();

    const server = app.listen(PORT, HOST, () => {
      console.log(`Backend server running on http://${HOST}:${PORT}`);
    });

    const gracefulShutdown = () => {
      stopRecoveryWorker();
      server.close(() => {
        process.exit(0);
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
