-- Run this in your Supabase SQL Editor to support the Gamified RPG features!

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS xp integer DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS level integer DEFAULT 1;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS water_ml integer DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_water_reset date DEFAULT CURRENT_DATE;
