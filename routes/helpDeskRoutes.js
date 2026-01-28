import express from 'express';
import { createTicket, getMyTickets, getAllTickets, updateTicketStatus } from '../controllers/helpDeskController.js';
import { auth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { replyToTicket } from '../controllers/helpDeskController.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configure Multer for file uploads (Memory Storage for Supabase)
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        // Accept images and docs
        if (file.mimetype.startsWith('image/') ||
            file.mimetype === 'application/pdf' ||
            file.mimetype === 'application/msword' ||
            file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            cb(null, true);
        } else {
            cb(new Error('Only images, PDFs, and Word documents are allowed!'), false);
        }
    }
});

const router = express.Router();

// Public/User routes
// Use upload.array('attachments') to handle multiple files
router.post('/', auth, upload.array('attachments', 5), createTicket);
router.get('/my-tickets', auth, getMyTickets);

// Admin routes

router.get('/all', auth, requireRole('admin'), getAllTickets);
// Allow both admin and ticket owner (buyer/expert) to close their own tickets
router.patch('/:id/status', auth, updateTicketStatus);
router.post('/:id/reply', auth, requireRole('admin'), replyToTicket);
router.post('/:id/reply', auth, requireRole('admin'), replyToTicket);

export default router;
