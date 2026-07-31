-- Social rows inherit the visibility of their parent post.
drop policy if exists "authenticated read comments" on public.comments;
drop policy if exists "authenticated read likes" on public.post_likes;

create policy "read comments for visible posts"
  on public.comments for select to authenticated
  using (exists (
    select 1 from public.posts
    where posts.id = comments.post_id
      and (posts.is_public = true or posts.author_id = (select auth.uid()))
  ));

create policy "read likes for visible posts"
  on public.post_likes for select to authenticated
  using (exists (
    select 1 from public.posts
    where posts.id = post_likes.post_id
      and (posts.is_public = true or posts.author_id = (select auth.uid()))
  ));

-- Add lightweight database-change events once, without recreating the publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_likes'
  ) then
    alter publication supabase_realtime add table public.post_likes;
  end if;
end $$;
