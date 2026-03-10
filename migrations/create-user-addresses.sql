-- Run this against the 'delivery' database if the table doesn't exist yet
-- docker exec -i <postgres-container> psql -U arroyo -d delivery < delivery_api/migrations/create-user-addresses.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS user_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  street VARCHAR(255) NOT NULL,
  number VARCHAR(20),
  floor VARCHAR(20),
  reference TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id);
