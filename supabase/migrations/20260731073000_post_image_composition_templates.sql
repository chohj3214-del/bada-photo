alter table public.post_images
  add column if not exists composition_template jsonb,
  add column if not exists analysis_version integer not null default 1;
