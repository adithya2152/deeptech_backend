import exchangeRates from '../utils/exchangeRates.js';

const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'CAD', 'AUD', 'NZD', 'JPY'];

/**
 * Get user's preferred display currency
 */
export const getPreferredCurrency = async (req, res) => {
    try {
        const userId = req.user.id;
        const currency = await exchangeRates.getUserPreferredCurrency(userId);

        res.json({
            success: true,
            data: {
                currency,
                supported: SUPPORTED_CURRENCIES
            }
        });
    } catch (error) {
        console.error('getPreferredCurrency error:', error);
        res.status(500).json({ message: 'Failed to get preferred currency' });
    }
};

/**
 * Set user's preferred display currency  
 */
export const setPreferredCurrency = async (req, res) => {
    try {
        const userId = req.user.id;
        const { currency } = req.body;

        if (!currency) {
            return res.status(400).json({ message: 'Currency is required' });
        }

        const upperCurrency = currency.toUpperCase();
        if (!SUPPORTED_CURRENCIES.includes(upperCurrency)) {
            return res.status(400).json({
                message: `Invalid currency. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`
            });
        }

        await exchangeRates.setUserPreferredCurrency(userId, upperCurrency);

        res.json({
            success: true,
            data: { currency: upperCurrency }
        });
    } catch (error) {
        console.error('setPreferredCurrency error:', error);
        res.status(500).json({ message: 'Failed to set preferred currency' });
    }
};

/**
 * Get current exchange rates (for frontend display)
 */
export const getRates = async (req, res) => {
    try {
        const rates = await exchangeRates.getCachedRates();

        // Convert to a simple object for frontend
        const ratesMap = rates.reduce((acc, r) => {
            acc[r.currency] = parseFloat(r.rate_from_inr);
            return acc;
        }, {});

        const lastUpdated = rates[0]?.updated_at || null;

        res.json({
            success: true,
            data: {
                baseCurrency: 'INR',
                rates: ratesMap,
                lastUpdated
            }
        });
    } catch (error) {
        console.error('getRates error:', error);
        res.status(500).json({ message: 'Failed to get exchange rates' });
    }
};

/**
 * Manually trigger a rate refresh (admin only)
 */
export const refreshRates = async (req, res) => {
    try {
        const result = await exchangeRates.refreshExchangeRates();

        if (result.success) {
            res.json({
                success: true,
                message: `Refreshed ${result.count} exchange rates`
            });
        } else {
            res.status(500).json({
                success: false,
                message: `Failed to refresh rates: ${result.error}`
            });
        }
    } catch (error) {
        console.error('refreshRates error:', error);
        res.status(500).json({ message: 'Failed to refresh exchange rates' });
    }
};

export default {
    getPreferredCurrency,
    setPreferredCurrency,
    getRates,
    refreshRates,
    SUPPORTED_CURRENCIES,
};
