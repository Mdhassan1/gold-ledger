/**
 * opening_gold_grams stores the scaled opening balance (1 gram = 10,000).
 * Monetary amounts are integer paise.
 * reversed_at and mime_type are audit/storage columns required by reversal
 * and gallery behaviour. They do not create a second balance source.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  normalized_phone TEXT,
  address TEXT,
  notes TEXT,
  opening_gold_grams INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1))
);

CREATE TABLE IF NOT EXISTS gold_conversions (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  previous_balance_scaled INTEGER NOT NULL,
  income_amount_paise INTEGER NOT NULL CHECK (income_amount_paise >= 0),
  advance_amount_paise INTEGER NOT NULL CHECK (advance_amount_paise >= 0),
  total_amount_paise INTEGER NOT NULL CHECK (total_amount_paise > 0),
  gold_rate_paise_per_gram INTEGER NOT NULL CHECK (gold_rate_paise_per_gram > 0),
  converted_grams_scaled INTEGER NOT NULL CHECK (converted_grams_scaled >= 0),
  new_balance_scaled INTEGER NOT NULL,
  conversion_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  reversed_at TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS income_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  payment_date TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  notes TEXT,
  conversion_status TEXT NOT NULL DEFAULT 'UNCONVERTED' CHECK (conversion_status IN ('UNCONVERTED', 'CONVERTED')),
  conversion_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (conversion_id) REFERENCES gold_conversions(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS advance_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('DEPOSIT', 'CONSUMPTION', 'REVERSAL')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  transaction_date TEXT NOT NULL,
  conversion_id TEXT,
  payment_method TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (conversion_id) REFERENCES gold_conversions(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS gold_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('OPENING', 'CONVERSION', 'REVERSAL')),
  reference_id TEXT,
  grams_delta_scaled INTEGER NOT NULL,
  balance_after_scaled INTEGER NOT NULL,
  transaction_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS customer_images (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  image_name TEXT NOT NULL,
  image_date TEXT NOT NULL,
  local_uri TEXT NOT NULL,
  mime_type TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_income_customer_date ON income_transactions(customer_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_income_status ON income_transactions(customer_id, conversion_status);
CREATE INDEX IF NOT EXISTS idx_income_conversion ON income_transactions(conversion_id);
CREATE INDEX IF NOT EXISTS idx_advance_customer_date ON advance_transactions(customer_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_advance_conversion ON advance_transactions(conversion_id);
CREATE INDEX IF NOT EXISTS idx_conversions_customer_date ON gold_conversions(customer_id, conversion_date);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON gold_ledger(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_images_customer ON customer_images(customer_id);
`;

export const TABLE_NAMES = [
  'customers',
  'income_transactions',
  'advance_transactions',
  'gold_conversions',
  'gold_ledger',
  'customer_images',
  'app_settings',
];
