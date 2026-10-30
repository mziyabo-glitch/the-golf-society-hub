# Priority UK Course Official Source Runs

Use these inputs to prioritize specific courses and improve verified promotions using official scorecards.

## Priority course input

- `COURSE_IMPORT_PRIORITY_COURSES`  
  Comma-separated names, for example:
  `The Vale Resort,Wycombe Heights Golf Centre,Upavon Golf Club,Shrivenham Park Golf Club`
- `COURSE_IMPORT_PRIORITY_COURSES_JSON`  
  Path to a JSON file with:

```json
{
  "courses": [
    {
      "name": "The Vale Resort",
      "officialScorecardUrl": "https://www.valeresort.com/golf/",
      "sourceType": "html",
      "notes": "Try official override before discovery",
      "officialUrls": ["https://www.valeresort.com/golf/"]
    }
  ]
}
```

Example file: `data/course-import-priority-courses.json`.

## Manual rescue input

- `COURSE_IMPORT_MANUAL_SCORECARD_JSON`

Supports a manually supplied official scorecard dataset:

```json
{
  "courses": [
    {
      "courseName": "The Vale Resort",
      "sourceUrl": "https://example.com/official-scorecard.pdf",
      "tees": [
        {
          "teeName": "White",
          "holes": [
            { "hole_number": 1, "par": 4, "yardage": 390, "stroke_index": 11 }
          ]
        }
      ]
    }
  ]
}
```

If the supplied data is complete and passes hardened validation, it can be promoted to `verified`.

## Priority maintenance budget

- `COURSE_IMPORT_MAX_PRIORITY_MAINTENANCE`

Reserves a small pass for imported priority candidates even when growth backlog is non-zero.
Defaults:

- maintenance mode: `3`
- seeding mode: `5`

## Report section

Nightly report now includes a `Priority course promotion audit` JSON section with:

- `officialSourceFound`
- `parseSuccess`
- `completeTeeCount`
- `missingSI`
- `missingYardage`
- `finalStatus`
- `unverifiedClassification`

Nightly report also includes `priorityCoursesReadyForOfficialConfirmation` with:

- `courseName`
- `completeTeeCount`
- `likelyPromotionBlocker`
- `suggestedNextAction`
