import express from 'express';
import { auth } from '../middleware/auth.js';
import {
    getPreferredCurrency,
    setPreferredCurrency,
    getRates,
    refreshRates,
} from '../controllers/currencyController.js';

const router = express.Router();

// Get user's preferred currency
router.get('/preferred', auth, getPreferredCurrency);

// Set user's preferred currency
router.put('/preferred', auth, setPreferredCurrency);

// Get current exchange rates
router.get('/rates', getRates);

// Admin: manually refresh rates (inline admin check)
router.post('/rates/refresh', auth, (req, res, next) => {
    if (req.user?.role !== 'admin' && req.user?.accountRole !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
}, refreshRates);

export default router;
