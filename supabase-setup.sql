create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(), image_url text not null, author_name text not null,
  location text, custom_pose_allowed boolean not null default true, created_at timestamptz not null default now()
);
alter table public.posts enable row level security;
create policy "public read posts" on public.posts for select using (true);
create policy "public create posts" on public.posts for insert with check (true);
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 500), author_name text not null, created_at timestamptz not null default now()
);
alter table public.comments enable row level security;
create policy "public read comments" on public.comments for select using (true);
create policy "public create comments" on public.comments for insert with check (true);
create table if not exists public.post_likes (post_id uuid not null references public.posts(id) on delete cascade, device_id text not null, created_at timestamptz not null default now(), primary key (post_id, device_id));
alter table public.post_likes enable row level security;
create policy "public read likes" on public.post_likes for select using (true);
create policy "public add like" on public.post_likes for insert with check (true);
create policy "public remove own like" on public.post_likes for delete using (true);
insert into storage.buckets (id, name, public) values ('post-images', 'post-images', true) on conflict (id) do nothing;
create policy "public read post images" on storage.objects for select using (bucket_id = 'post-images');
create policy "public upload post images" on storage.objects for insert with check (bucket_id = 'post-images');
