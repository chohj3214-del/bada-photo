alter table public.post_images
  add column if not exists crop_data jsonb;
