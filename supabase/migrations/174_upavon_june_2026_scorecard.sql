-- Upavon Golf Club official scorecard June 2026 (Black/White/Yellow/Red tees).
-- Source: https://www.upavongolfclub.co.uk/uploads/upavon/File/Upavon%20Scorecard%20June%202026.pdf

UPDATE courses SET
  golfer_data_status = 'verified',
  validation_basis = 'official_only',
  data_confidence = 'high',
  source_type = 'official_club_scorecard',
  source_url = 'https://www.upavongolfclub.co.uk/uploads/upavon/File/Upavon%20Scorecard%20June%202026.pdf',
  enrichment_status = 'imported',
  sync_status = 'ok',
  confidence_score = 100
WHERE id = '438402c6-6f5f-4957-af77-7843666ae6f7';

INSERT INTO course_tees (course_id, tee_name, tee_color, course_rating, slope_rating, par_total, yards, is_active, source_type, sync_status, confidence_score) VALUES
('438402c6-6f5f-4957-af77-7843666ae6f7', 'Black', 'black', 73.4, 134, 71, 6722, true, 'official_club_scorecard', 'ok', 100),
('438402c6-6f5f-4957-af77-7843666ae6f7', 'White', 'white', 72.0, 132, 71, 6437, true, 'official_club_scorecard', 'ok', 100),
('438402c6-6f5f-4957-af77-7843666ae6f7', 'Yellow', 'yellow', 70.1, 128, 71, 6032, true, 'official_club_scorecard', 'ok', 100),
('438402c6-6f5f-4957-af77-7843666ae6f7', 'Red', 'red', 67.6, 117, 71, 5459, true, 'official_club_scorecard', 'ok', 100),
('438402c6-6f5f-4957-af77-7843666ae6f7', 'Red (Ladies)', 'red', 76.3, 134, 71, 5459, true, 'official_club_scorecard', 'ok', 100)
ON CONFLICT (course_id, tee_name) DO UPDATE SET
  tee_color = EXCLUDED.tee_color,
  course_rating = EXCLUDED.course_rating,
  slope_rating = EXCLUDED.slope_rating,
  par_total = EXCLUDED.par_total,
  yards = EXCLUDED.yards,
  is_active = true,
  source_type = EXCLUDED.source_type,
  sync_status = EXCLUDED.sync_status,
  confidence_score = EXCLUDED.confidence_score;

DELETE FROM course_holes WHERE course_id = '438402c6-6f5f-4957-af77-7843666ae6f7';

WITH tee_map AS (
  SELECT id, tee_name FROM course_tees WHERE course_id = '438402c6-6f5f-4957-af77-7843666ae6f7'
),
hole_data AS (
  SELECT * FROM (VALUES
    ('Black', 1, 4, 13, 303), ('Black', 2, 4, 9, 426), ('Black', 3, 4, 3, 375), ('Black', 4, 4, 1, 457), ('Black', 5, 5, 17, 482),
    ('Black', 6, 3, 5, 259), ('Black', 7, 5, 11, 510), ('Black', 8, 3, 7, 216), ('Black', 9, 4, 15, 371),
    ('Black', 10, 4, 4, 388), ('Black', 11, 4, 14, 325), ('Black', 12, 3, 18, 218), ('Black', 13, 5, 2, 647),
    ('Black', 14, 3, 8, 152), ('Black', 15, 5, 16, 498), ('Black', 16, 4, 6, 491), ('Black', 17, 4, 12, 404), ('Black', 18, 3, 10, 200),
    ('White', 1, 4, 13, 303), ('White', 2, 4, 9, 426), ('White', 3, 4, 3, 390), ('White', 4, 4, 1, 416), ('White', 5, 5, 17, 482),
    ('White', 6, 3, 5, 229), ('White', 7, 5, 11, 499), ('White', 8, 3, 7, 196), ('White', 9, 4, 15, 354),
    ('White', 10, 4, 4, 388), ('White', 11, 4, 14, 311), ('White', 12, 3, 18, 185), ('White', 13, 5, 2, 604),
    ('White', 14, 3, 8, 152), ('White', 15, 5, 16, 498), ('White', 16, 4, 6, 459), ('White', 17, 4, 12, 378), ('White', 18, 3, 10, 167),
    ('Yellow', 1, 4, 13, 295), ('Yellow', 2, 4, 9, 354), ('Yellow', 3, 4, 3, 389), ('Yellow', 4, 4, 1, 405), ('Yellow', 5, 5, 17, 480),
    ('Yellow', 6, 3, 5, 201), ('Yellow', 7, 5, 11, 476), ('Yellow', 8, 3, 7, 188), ('Yellow', 9, 4, 15, 311),
    ('Yellow', 10, 4, 4, 350), ('Yellow', 11, 4, 14, 304), ('Yellow', 12, 3, 18, 173), ('Yellow', 13, 5, 2, 562),
    ('Yellow', 14, 3, 8, 138), ('Yellow', 15, 5, 16, 487), ('Yellow', 16, 4, 6, 417), ('Yellow', 17, 4, 12, 350), ('Yellow', 18, 3, 10, 152),
    ('Red', 1, 4, 13, 286), ('Red', 2, 4, 9, 292), ('Red', 3, 4, 3, 367), ('Red', 4, 4, 1, 391), ('Red', 5, 5, 17, 437),
    ('Red', 6, 3, 5, 188), ('Red', 7, 5, 11, 439), ('Red', 8, 3, 7, 149), ('Red', 9, 4, 15, 303),
    ('Red', 10, 4, 4, 350), ('Red', 11, 4, 14, 266), ('Red', 12, 3, 18, 124), ('Red', 13, 5, 2, 494),
    ('Red', 14, 3, 8, 131), ('Red', 15, 5, 16, 430), ('Red', 16, 4, 6, 375), ('Red', 17, 4, 12, 301), ('Red', 18, 3, 10, 136),
    ('Red (Ladies)', 1, 4, 13, 286), ('Red (Ladies)', 2, 4, 9, 292), ('Red (Ladies)', 3, 4, 3, 367), ('Red (Ladies)', 4, 4, 1, 391), ('Red (Ladies)', 5, 5, 17, 437),
    ('Red (Ladies)', 6, 3, 5, 188), ('Red (Ladies)', 7, 5, 11, 439), ('Red (Ladies)', 8, 3, 7, 149), ('Red (Ladies)', 9, 4, 15, 303),
    ('Red (Ladies)', 10, 4, 4, 350), ('Red (Ladies)', 11, 4, 14, 266), ('Red (Ladies)', 12, 3, 18, 124), ('Red (Ladies)', 13, 5, 2, 494),
    ('Red (Ladies)', 14, 3, 8, 131), ('Red (Ladies)', 15, 5, 16, 430), ('Red (Ladies)', 16, 4, 6, 375), ('Red (Ladies)', 17, 4, 12, 301), ('Red (Ladies)', 18, 3, 10, 136)
  ) AS t(tee_name, hole_number, par, stroke_index, yardage)
)
INSERT INTO course_holes (course_id, tee_id, hole_number, par, stroke_index, yardage, source_type, sync_status, confidence_score)
SELECT '438402c6-6f5f-4957-af77-7843666ae6f7', tm.id, hd.hole_number, hd.par, hd.stroke_index, hd.yardage, 'official_club_scorecard', 'ok', 100
FROM hole_data hd
JOIN tee_map tm ON tm.tee_name = hd.tee_name;
