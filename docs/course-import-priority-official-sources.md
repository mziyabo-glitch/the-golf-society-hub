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
    { "name": "The Vale Resort", "officialUrls": ["https://www.valeresort.com/golf/"] }
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

## Report section

Nightly report now includes a `Priority course promotion audit` JSON section with:

- `officialSourceFound`
- `parseSuccess`
- `completeTeeCount`
- `missingSI`
- `missingYardage`
- `finalStatus`
