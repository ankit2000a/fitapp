-- Migration: Add activity_level column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS activity_level text DEFAULT 'lightly_active';
