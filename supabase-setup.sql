create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(), image_url text not null, author_name text not null,
  location text, custom_pose_allowed boolean not null default true, created_at timestamptz not null default now()
);
alter table public.posts enable row level security;
create policy "public read posts" on public.posts for select using (true);
create policy "public create posts" on public.posts for insert with check (true);
insert into storage.buckets (id, name, public) values ('post-images', 'post-images', true) on conflict (id) do nothing;
create policy "public read post images" on storage.objects for select using (bucket_id = 'post-images');
create policy "public upload post images" on storage.objects for insert with check (bucket_id = 'post-images');
