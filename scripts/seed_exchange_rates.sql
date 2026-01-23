-- Seed exchange rates with 2026 values (as of January 2026)
-- Base currency is INR, rates show how much of target currency = 1 INR

-- Clear existing rates and insert fresh ones
DELETE FROM exchange_rates;

INSERT INTO exchange_rates (currency, rate_from_inr, updated_at) VALUES
('INR', 1.0, NOW()),
('USD', 0.01091, NOW()),  -- 1 USD = 91.65 INR, so 1 INR = 0.01091 USD
('EUR', 0.01044, NOW()),  -- 1 EUR = 95.80 INR  
('GBP', 0.00870, NOW()),  -- 1 GBP = 114.94 INR
('AED', 0.04007, NOW()),  -- 1 AED = 24.95 INR
('SGD', 0.01463, NOW()),  -- 1 SGD = 68.35 INR
('CAD', 0.01557, NOW()),  -- 1 CAD = 64.22 INR
('AUD', 0.01723, NOW()),  -- 1 AUD = 58.03 INR
('NZD', 0.01872, NOW()),  -- 1 NZD = 53.42 INR
('JPY', 1.70100, NOW());  -- 1 JPY = 0.588 INR (so 1 INR = 1.70 JPY)

-- Verify the rates
SELECT * FROM exchange_rates ORDER BY currency;
