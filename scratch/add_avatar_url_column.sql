-- Run this in your Supabase SQL Editor to support Profile Picture Upload!

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url text;
