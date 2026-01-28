import NotificationModel from '../models/notificationModel.js';
import pool from '../config/db.js';
import HelpTicket from '../models/helpTicketModel.js';
import { uploadFile, BUCKETS, initializeStorageBuckets } from '../utils/storage.js';

export const createTicket = async (req, res) => {
    try {
        const { type, subject, description, priority } = req.body;
        const profileId = req.user.profileId; // Switch to profileId

        if (!profileId) {
            return res.status(400).json({ success: false, message: 'No active profile found for this user.' });
        }

        if (!type || !description) {
            return res.status(400).json({ success: false, message: 'Type and description are required' });
        }

        const ticket = await HelpTicket.create({ profileId, type, subject, description, priority });

        // Handle attachments if any
        if (req.files && req.files.length > 0) {
            // Ensure bucket exists
            await initializeStorageBuckets();

            for (const file of req.files) {
                // Upload to Supabase
                const timestamp = Date.now();
                const randomString = Math.random().toString(36).substring(7);
                const filePath = `${ticket.id}/${timestamp}-${randomString}-${file.originalname}`;

                const { url } = await uploadFile(
                    BUCKETS.HELP_DESK,
                    filePath,
                    file.buffer,
                    file.mimetype
                );

                await HelpTicket.addAttachment({
                    ticketId: ticket.id,
                    fileName: file.originalname,
                    filePath: url, // Store Supabase URL
                    fileSize: file.size,
                    mimeType: file.mimetype
                });
            }
        }

        res.status(201).json({ success: true, ticket });
    } catch (error) {
        console.error('Error creating help ticket:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

export const getMyTickets = async (req, res) => {
    try {
        const profileId = req.user.profileId;
        const tickets = await HelpTicket.getByProfileId(profileId);
        res.json({ success: true, tickets });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

export const getAllTickets = async (req, res) => {
    try {
        const tickets = await HelpTicket.getAll();
        res.json({ success: true, tickets });
    } catch (error) {
        console.error('Error fetching all tickets:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

export const updateTicketStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminNotes } = req.body;

        const ticket = await HelpTicket.updateStatus(id, status, adminNotes);

        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        res.json({ success: true, ticket });
    } catch (error) {
        console.error('Error updating ticket:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

export const replyToTicket = async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, message: 'Message is required' });
        }
        // Find the ticket and its profile
        const ticketResult = await pool.query('SELECT * FROM help_tickets WHERE id = $1', [id]);
        const ticket = ticketResult.rows[0];
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }
        // Check that the profile exists
        const profileResult = await pool.query('SELECT id FROM profiles WHERE id = $1', [ticket.profile_id]);
        const profile = profileResult.rows[0];
        if (!profile) {
            return res.status(404).json({ success: false, message: 'Profile not found' });
        }
        // Create notification for the profile
        await NotificationModel.create(
            ticket.profile_id,
            'helpdesk_reply',
            `Support Reply: ${ticket.subject || 'Ticket'}`,
            `Your help desk ticket "${ticket.subject || 'No Subject'}" has received a reply from the admin.\n\nReply: ${message}`,
            null
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Error replying to help ticket:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};