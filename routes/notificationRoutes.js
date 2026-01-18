import express from 'express';
import { auth } from '../middleware/auth.js';
import {
    getNotificationCounts,
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteAllNotifications
} from '../controllers/notificationController.js';

const router = express.Router();

// Get notification counts (existing - for role-based counters)
router.get('/counts', auth, getNotificationCounts);

// Get all notifications for current user
router.get('/', auth, getNotifications);

// Get unread count for navbar badge
router.get('/unread-count', auth, getUnreadCount);

// Mark single notification as read
router.patch('/:id/read', auth, markAsRead);

// Mark all notifications as read
router.patch('/read-all', auth, markAllAsRead);

// Delete all notifications
router.delete('/delete-all', auth, deleteAllNotifications);

export default router;
