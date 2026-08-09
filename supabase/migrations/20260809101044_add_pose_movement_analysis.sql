alter table public.analysis_matches
  add column if not exists movement_score integer not null default 0 check (movement_score between 0 and 100),
  add column if not exists distance_meters numeric(10,1) not null default 0 check (distance_meters >= 0),
  add column if not exists net_control_percent integer not null default 0 check (net_control_percent between 0 and 100),
  add column if not exists tracking_rate integer not null default 0 check (tracking_rate between 0 and 100),
  add column if not exists movement_payload jsonb;

comment on column public.analysis_matches.movement_payload is
  'Pose-v3 movement report: court calibration, low-frequency position samples, heatmap, metrics, and evidence timestamps. Raw video and image frames are not stored.';
