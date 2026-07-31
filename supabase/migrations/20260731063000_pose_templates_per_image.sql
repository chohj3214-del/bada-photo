-- Store only normalized body-joint geometry. No face embedding or identity data is stored.
alter table public.post_images
  add column if not exists pose_template jsonb,
  add column if not exists pose_status text not null default 'pending'
    check (pose_status in ('pending', 'ready', 'failed'));

create index if not exists post_images_pose_status_idx
  on public.post_images (post_id, pose_status);

drop policy if exists "users update own post image pose metadata" on public.post_images;
create policy "users update own post image pose metadata"
  on public.post_images for update to authenticated
  using (exists (
    select 1 from public.posts
    where posts.id = post_images.post_id
      and posts.author_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.posts
    where posts.id = post_images.post_id
      and posts.author_id = (select auth.uid())
  ));
