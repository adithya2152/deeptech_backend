export const DEFAULT_CURRENCY = "INR";

export const normalizeCurrency = (value) => {
  if (value === undefined || value === null || value === "") return DEFAULT_CURRENCY;
  const currency = String(value).trim().toUpperCase();
  return currency || DEFAULT_CURRENCY;
};

export const isValidCurrencyCode = (value) => {
  const currency = normalizeCurrency(value);
  // ISO-4217 style code validation: 3 uppercase letters.
  return /^[A-Z]{3}$/.test(currency);
};

export const requireValidCurrency = (value) => {
  const currency = normalizeCurrency(value);
  if (!/^[A-Z]{3}$/.test(currency)) {
    const err = new Error("Invalid currency code");
    err.statusCode = 400;
    err.code = "INVALID_CURRENCY";
    throw err;
  }
  return currency;
};
