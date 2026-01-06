import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./config/db.js";
import userAuthRoutes from "./routes/userAuthRoutes.js";
import adminRoutes from './routes/adminRoutes.js';
import projectRoutes from "./routes/projectRoutes.js";
import expertRoutes from "./routes/expertRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import proposalsRoutes from "./routes/proposalsRoutes.js";
import contractsRoutes from "./routes/contractsRoutes.js";
import workLogsRoutes from "./routes/workLogsRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import reportRoutes from './routes/reportRoutes.js';
import disputeRoutes from './routes/disputeRoutes.js';
import dayWorkSummariesRoutes from "./routes/dayWorkSummariesRoutes.js";
import http from "http";
import { Server } from "socket.io";
import { initializeStorageBuckets } from "./utils/storage.js";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

// Initialize storage buckets
initializeStorageBuckets();

// Socket.io setup
export const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token) {
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        console.error("Socket authentication error:", err.message);
        return next(new Error("Authentication error"));
      }
      socket.user = decoded;
      next();
    });
  } else {
    next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.user.id}, Socket ID: ${socket.id}`);

  // User joins a chat room
  socket.on("join_chat", (chatId) => {
    socket.join(chatId);
    console.log(`User ${socket.user.id} joined chat ${chatId}`);

    // Notify others in the room
    io.to(chatId).emit("user_joined", {
      userId: socket.user.id,
      timestamp: new Date(),
    });
  });

  // User leaves a chat room
  socket.on("leave_chat", (chatId) => {
    socket.leave(chatId);
    console.log(`User ${socket.user.id} left chat ${chatId}`);

    io.to(chatId).emit("user_left", {
      userId: socket.user.id,
      timestamp: new Date(),
    });
  });

  // Handle real-time message sending
  socket.on("send_message", async (data) => {
    const { chatId, content, messageId } = data;
    const senderId = socket.user.id;

    try {
      // Emit message to all users in the chat room
      io.to(chatId).emit("new_message", {
        id: messageId,
        chatId,
        senderId,
        content,
        createdAt: new Date(),
        isRead: false,
      });

      console.log(`Message sent in chat ${chatId} by ${senderId}`);
    } catch (error) {
      console.error("Error sending message:", error);
      socket.emit("message_error", { error: "Failed to send message" });
    }
  });

  // Handle typing indicators
  socket.on("typing_start", (chatId) => {
    socket.to(chatId).emit("user_typing", {
      userId: socket.user.id,
      isTyping: true,
    });
  });

  socket.on("typing_stop", (chatId) => {
    socket.to(chatId).emit("user_typing", {
      userId: socket.user.id,
      isTyping: false,
    });
  });

  // Handle read receipts
  socket.on("message_read", (data) => {
    const { chatId, messageId } = data;

    io.to(chatId).emit("message_status_update", {
      messageId,
      isRead: true,
      readBy: socket.user.id,
      timestamp: new Date(),
    });
  });

  // Handle attachment upload notification
  socket.on("attachment_uploaded", (data) => {
    const { chatId, messageId, fileName, fileSize, mimeType } = data;

    io.to(chatId).emit("new_attachment", {
      messageId,
      fileName,
      fileSize,
      mimeType,
      uploadedBy: socket.user.id,
      timestamp: new Date(),
    });
  });

  // Handle attachment deletion
  socket.on("attachment_deleted", (data) => {
    const { chatId, attachmentId } = data;

    io.to(chatId).emit("attachment_removed", {
      attachmentId,
      removedBy: socket.user.id,
      timestamp: new Date(),
    });
  });

  socket.on("disconnect", () => {
    console.log(
      `User disconnected: ${socket.user.id}, Socket ID: ${socket.id}`
    );
  });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,PUT,POST,DELETE,OPTIONS,PATCH"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-auth-token"
  );

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }

  next();
});

app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      status: "healthy",
      serverTime: result.rows[0].now,
      message: "Server is running and database is connected",
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      message: "DeepTech Backend API",
      status: "running",
      timestamp: result.rows[0].now,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.use("/api/auth", userAuthRoutes);
app.use('/api/admin', adminRoutes);
app.use("/api/experts", expertRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/chats", messageRoutes);
app.use("/api/proposals", proposalsRoutes);
app.use("/api/contracts", contractsRoutes);
app.use("/api/work-logs", workLogsRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/disputes', disputeRoutes);
app.use("/api/day-work-summaries", dayWorkSummariesRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.path,
  });
});

app.use((err, req, res, next) => {
  console.error("Global error handler:", err);

  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File too large. Maximum allowed size is 5MB.',
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

server.listen(port, async () => {
  try {
    await initializeStorageBuckets(); 
  } catch (error) {
    console.error("Failed to initialize storage buckets:", error);
  }
  console.log(`Server is running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});