create table if not exists public.saved_posts (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table public.saved_posts enable row level security;

drop policy if exists "users read own saved posts" on public.saved_posts;
drop policy if exists "users save visible posts" on public.saved_posts;
drop policy if exists "users remove own saved posts" on public.saved_posts;

create policy "users read own saved posts"
  on public.saved_posts for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.posts
      where posts.id = saved_posts.post_id
        and (posts.is_public = true or posts.author_id = (select auth.uid()))
    )
  );

create policy "users save visible posts"
  on public.saved_posts for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.posts
      where posts.id = saved_posts.post_id
        and (posts.is_public = true or posts.author_id = (select auth.uid()))
    )
  );

create policy "users remove own saved posts"
  on public.saved_posts for delete to authenticated
  using (user_id = (select auth.uid()));

create index if not exists saved_posts_user_created_at
  on public.saved_posts(user_id, created_at desc);
