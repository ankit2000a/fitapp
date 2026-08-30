-- Create the feed_reactions table
CREATE TABLE IF NOT EXISTS public.feed_reactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    feed_item_id text NOT NULL,
    emoji text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT unique_user_item_reaction UNIQUE (user_id, feed_item_id, emoji)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.feed_reactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.feed_reactions;
DROP POLICY IF EXISTS "Allow insert for self" ON public.feed_reactions;
DROP POLICY IF EXISTS "Allow delete for self" ON public.feed_reactions;

-- Create policies
CREATE POLICY "Allow select for authenticated users" ON public.feed_reactions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for self" ON public.feed_reactions
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow delete for self" ON public.feed_reactions
    FOR DELETE TO authenticated USING (auth.uid() = user_id);
