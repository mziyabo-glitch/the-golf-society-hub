-- OOM 5 UpAvon: add Tichafa Muromo to published tee sheet (paid 2026-07-09 after initial publish).
-- Event: 6cdd6616-1aab-41a2-bc28-1619897f0828
-- Member: 36a4db22-741a-434a-8cd9-b081e308bd84

INSERT INTO public.tee_groups (event_id, group_number, tee_time)
VALUES ('6cdd6616-1aab-41a2-bc28-1619897f0828', 10, '12:45:00')
ON CONFLICT (event_id, group_number) DO UPDATE
SET tee_time = EXCLUDED.tee_time,
    updated_at = now();

INSERT INTO public.tee_group_players (event_id, group_number, position, player_id)
VALUES (
  '6cdd6616-1aab-41a2-bc28-1619897f0828',
  10,
  0,
  '36a4db22-741a-434a-8cd9-b081e308bd84'
)
ON CONFLICT (event_id, player_id) DO UPDATE
SET group_number = EXCLUDED.group_number,
    position = EXCLUDED.position,
    updated_at = now();
