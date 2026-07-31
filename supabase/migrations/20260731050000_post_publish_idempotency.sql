-- Keeps a multi-image upload as one post and makes a retry safe.
alter table public.posts
  add column if not exists client_request_id uuid;

create unique index if not exists posts_author_request_unique
  on public.posts (author_id, client_request_id)
  where client_request_id is not null;

create table if not exists public.post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  image_url text not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (post_id, sort_order)
);

alter table public.post_images enable row level security;

drop policy if exists "authenticated read post images metadata" on public.post_images;
drop policy if exists "users add own post images metadata" on public.post_images;
drop policy if exists "users delete own post images metadata" on public.post_images;

create policy "authenticated read post images metadata"
  on public.post_images for select to authenticated
  using (exists (
    select 1 from public.posts
    where posts.id = post_images.post_id
      and (posts.is_public = true or posts.author_id = (select auth.uid()))
  ));

create policy "users add own post images metadata"
  on public.post_images for insert to authenticated
  with check (exists (
    select 1 from public.posts
    where posts.id = post_images.post_id
      and posts.author_id = (select auth.uid())
  ));

create policy "users delete own post images metadata"
  on public.post_images for delete to authenticated
  using (exists (
    select 1 from public.posts
    where posts.id = post_images.post_id
      and posts.author_id = (select auth.uid())
  ));

create index if not exists post_images_post_sort on public.post_images(post_id, sort_order);
