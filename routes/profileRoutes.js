import express from 'express';
import { auth } from '../middleware/auth.js';
import { getMyProfile, updateMyProfile, getUserReviews } from '../controllers/profileController.js';
import multer from 'multer';
import { uploadProfileMedia } from '../controllers/authController.js';

const router = express.Router();

router.get('/me', auth, getMyProfile);
router.patch('/me', auth, updateMyProfile);
router.get('/:id/reviews', getUserReviews);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Mirror profile media upload here for the new /api/profile namespace
router.post('/media', auth, upload.single('file'), uploadProfileMedia);

export default router;