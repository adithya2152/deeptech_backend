import express from 'express';

const router = express.Router();
import {body , validationResult} from 'express-validator';
import auth from '../middleware/auth.js';

// Test endpoint
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Auth routes are working!',
        timestamp: new Date().toISOString()
    });
});


router.post('/register',)