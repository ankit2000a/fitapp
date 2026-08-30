-- SQL SCRIPT: Run this in the Supabase SQL Editor to configure Row Level Security (RLS) policies properly.

-- ==========================================
-- 1. USERS TABLE POLICIES
-- ==========================================
-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow read for all authenticated" ON public.users;
DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.users;
DROP POLICY IF EXISTS "Allow update for authenticated" ON public.users;
DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.users;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.users;
DROP POLICY IF EXISTS "Allow insert for self" ON public.users;
DROP POLICY IF EXISTS "Allow update for self" ON public.users;
DROP POLICY IF EXISTS "Allow delete for self" ON public.users;

-- Create policies (Allows friends to view profiles, but only the user can modify their own row)
CREATE POLICY "Allow read for all authenticated" ON public.users 
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated" ON public.users 
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow update for authenticated" ON public.users 
    FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow delete for authenticated" ON public.users 
    FOR DELETE TO authenticated USING (auth.uid() = id);


-- ==========================================
-- 2. FOOD LOGS TABLE POLICIES
-- ==========================================
DROP POLICY IF EXISTS "Allow read for all authenticated" ON public.food_logs;
DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.food_logs;
DROP POLICY IF EXISTS "Allow update for authenticated" ON public.food_logs;
DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.food_logs;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.food_logs;
DROP POLICY IF EXISTS "Allow insert for self" ON public.food_logs;
DROP POLICY IF EXISTS "Allow update for self" ON public.food_logs;
DROP POLICY IF EXISTS "Allow delete for self" ON public.food_logs;

-- Create policies (Allows friends to view logs on feed, but only owner can edit/create logs)
CREATE POLICY "Allow read for all authenticated" ON public.food_logs 
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated" ON public.food_logs 
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow update for authenticated" ON public.food_logs 
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow delete for authenticated" ON public.food_logs 
    FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- ==========================================
-- 3. HEALTH SCORES TABLE POLICIES
-- ==========================================
DROP POLICY IF EXISTS "Allow read for all authenticated" ON public.health_scores;
DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.health_scores;
DROP POLICY IF EXISTS "Allow update for authenticated" ON public.health_scores;
DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.health_scores;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.health_scores;
DROP POLICY IF EXISTS "Allow insert for self" ON public.health_scores;
DROP POLICY IF EXISTS "Allow update for self" ON public.health_scores;
DROP POLICY IF EXISTS "Allow delete for self" ON public.health_scores;

-- Create policies (Allows friends to view scores for leaderboard, only owner can modify)
CREATE POLICY "Allow read for all authenticated" ON public.health_scores 
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated" ON public.health_scores 
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow update for authenticated" ON public.health_scores 
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow delete for authenticated" ON public.health_scores 
    FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- ==========================================
-- 4. FRIENDSHIPS TABLE POLICIES
-- ==========================================
DROP POLICY IF EXISTS "Allow read for all authenticated" ON public.friendships;
DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.friendships;
DROP POLICY IF EXISTS "Allow update for authenticated" ON public.friendships;
DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.friendships;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.friendships;
DROP POLICY IF EXISTS "Allow insert for self" ON public.friendships;
DROP POLICY IF EXISTS "Allow update for self/friend" ON public.friendships;
DROP POLICY IF EXISTS "Allow delete for self/friend" ON public.friendships;

-- Create policies (Only users involved in friendship can edit or delete, anyone logged in can view)
CREATE POLICY "Allow read for all authenticated" ON public.friendships 
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated" ON public.friendships 
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow update for authenticated" ON public.friendships 
    FOR UPDATE TO authenticated USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Allow delete for authenticated" ON public.friendships 
    FOR DELETE TO authenticated USING (auth.uid() = user_id OR auth.uid() = friend_id);
