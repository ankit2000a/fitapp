-- Add privacy column to users table defaulting to 'private'
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS privacy text DEFAULT 'private';
