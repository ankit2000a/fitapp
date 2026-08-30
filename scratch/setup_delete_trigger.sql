-- 1. Clean up currently orphaned users (accounts already deleted from auth.users but still present in public tables)
DELETE FROM public.friendships 
WHERE user_id NOT IN (SELECT id FROM auth.users) 
   OR friend_id NOT IN (SELECT id FROM auth.users);

DELETE FROM public.food_logs 
WHERE user_id NOT IN (SELECT id FROM auth.users);

DELETE FROM public.health_scores 
WHERE user_id NOT IN (SELECT id FROM auth.users);

-- Conditionally clean up social_reactions if the table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'social_reactions'
  ) THEN
    EXECUTE 'DELETE FROM public.social_reactions WHERE user_id NOT IN (SELECT id FROM auth.users) OR target_user_id NOT IN (SELECT id FROM auth.users)';
  END IF;
END $$;

DELETE FROM public.users 
WHERE id NOT IN (SELECT id FROM auth.users);

-- 2. Create trigger function to automatically handle future deletions from auth.users
CREATE OR REPLACE FUNCTION public.handle_deleted_user()
RETURNS trigger AS $$
BEGIN
  -- Delete referencing rows from public tables
  DELETE FROM public.friendships WHERE user_id = OLD.id OR friend_id = OLD.id;
  DELETE FROM public.food_logs WHERE user_id = OLD.id;
  DELETE FROM public.health_scores WHERE user_id = OLD.id;
  
  -- Conditionally delete referencing rows from social_reactions if it exists
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'social_reactions'
  ) THEN
    EXECUTE 'DELETE FROM public.social_reactions WHERE user_id = $1 OR target_user_id = $1' USING OLD.id;
  END IF;
  
  -- Delete the user profile
  DELETE FROM public.users WHERE id = OLD.id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Bind the trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_deleted_user();
