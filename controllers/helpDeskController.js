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
