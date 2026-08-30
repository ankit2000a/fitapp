-- Run this in your Supabase SQL Editor to support live Progress Pulse data!

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS next_update_date timestamp with time zone;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_projection jsonb;
