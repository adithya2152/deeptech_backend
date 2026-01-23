import pool from '../config/db.js';

const BASE_CURRENCY = 'INR';

// Frankfurter API - free, no key required
const FRANKFURTER_API = 'https://api.frankfurter.app/latest';

/**
 * Fetch latest exchange rates from Frankfurter API and cache in DB.
 * Rates are stored as "1 INR = X target_currency"
 */
export async function refreshExchangeRates() {
    try {
        // Frankfurter uses EUR as base, so we need to convert to INR base
        const response = await fetch(`${FRANKFURTER_API}?from=${BASE_CURRENCY}`);
        if (!response.ok) {
            throw new Error(`Frankfurter API error: ${response.status}`);
        }

        const data = await response.json();
        const rates = data.rates; // { USD: 0.0119, EUR: 0.0110, ... }

        // Upsert each rate into the database
        const upsertQuery = `
      INSERT INTO exchange_rates (currency, rate_from_inr, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (currency) 
      DO UPDATE SET rate_from_inr = $2, updated_at = NOW()
    `;

        for (const [currency, rate] of Object.entries(rates)) {
            await pool.query(upsertQuery, [currency, rate]);
        }

        // Also store INR -> INR as 1 for completeness
        await pool.query(upsertQuery, [BASE_CURRENCY, 1]);

        console.log(`[ExchangeRates] Refreshed ${Object.keys(rates).length + 1} rates`);
        return { success: true, count: Object.keys(rates).length + 1 };
    } catch (error) {
        console.error('[ExchangeRates] Failed to refresh rates:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get all cached exchange rates from DB
 */
export async function getCachedRates() {
    const { rows } = await pool.query(`
    SELECT currency, rate_from_inr, updated_at 
    FROM exchange_rates 
    ORDER BY currency
  `);
    return rows;
}

/**
 * Get a specific rate from INR to target currency
 */
export async function getRate(targetCurrency) {
    if (!targetCurrency || targetCurrency.toUpperCase() === BASE_CURRENCY) {
        return 1;
    }

    const { rows } = await pool.query(
        `SELECT rate_from_inr FROM exchange_rates WHERE currency = $1`,
        [targetCurrency.toUpperCase()]
    );

    return rows[0]?.rate_from_inr || null;
}

/**
 * Convert an amount from INR to user's preferred currency (for display)
 * @param {number} amountINR - Amount in INR (base currency)
 * @param {string} targetCurrency - Target currency code (USD, EUR, etc.)
 * @returns {number} - Converted amount (or original if rate unavailable)
 */
export async function toUserCurrency(amountINR, targetCurrency) {
    if (!amountINR || isNaN(amountINR)) return 0;
    if (!targetCurrency || targetCurrency.toUpperCase() === BASE_CURRENCY) {
        return amountINR;
    }

    const rate = await getRate(targetCurrency);
    if (!rate) {
        console.warn(`[ExchangeRates] No rate for ${targetCurrency}, returning INR`);
        return amountINR; // Fallback: return original INR amount
    }

    return amountINR * rate;
}

/**
 * Convert an amount from user's currency to INR (for storage)
 * @param {number} amount - Amount in user's currency
 * @param {string} fromCurrency - Source currency code
 * @returns {number} - Amount in INR
 */
export async function toBaseCurrency(amount, fromCurrency) {
    if (!amount || isNaN(amount)) return 0;
    if (!fromCurrency || fromCurrency.toUpperCase() === BASE_CURRENCY) {
        return amount;
    }

    const rate = await getRate(fromCurrency);
    if (!rate || rate === 0) {
        console.warn(`[ExchangeRates] No rate for ${fromCurrency}, assuming INR`);
        return amount; // Fallback: assume it's already INR
    }

    // rate is "1 INR = X foreign", so to get INR: amount / rate
    return amount / rate;
}

/**
 * Get user's preferred currency from DB
 */
export async function getUserPreferredCurrency(userId) {
    const { rows } = await pool.query(
        `SELECT preferred_currency FROM user_preferred_currency WHERE user_id = $1`,
        [userId]
    );
    return rows[0]?.preferred_currency || null;
}

/**
 * Set user's preferred currency
 */
export async function setUserPreferredCurrency(userId, currency) {
    await pool.query(`
    INSERT INTO user_preferred_currency (user_id, preferred_currency, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (user_id) 
    DO UPDATE SET preferred_currency = $2, updated_at = NOW()
  `, [userId, currency.toUpperCase()]);
}

/**
 * Convert multiple amounts at once (batch operation)
 */
export async function batchConvertToUserCurrency(amounts, targetCurrency) {
    if (!targetCurrency || targetCurrency.toUpperCase() === BASE_CURRENCY) {
        return amounts;
    }

    const rate = await getRate(targetCurrency);
    if (!rate) return amounts;

    return amounts.map(amt => (amt || 0) * rate);
}

export default {
    BASE_CURRENCY,
    refreshExchangeRates,
    getCachedRates,
    getRate,
    toUserCurrency,
    toBaseCurrency,
    getUserPreferredCurrency,
    setUserPreferredCurrency,
    batchConvertToUserCurrency,
};
