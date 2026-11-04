# coach-notes (data branch)

Not code. This branch holds `coach-notes.json`, written each evening by Paul's scheduled
"Tomorrow's Exercise advice" task, with advice for the NEXT day's gym session.

LiftTrack reads it from:
https://raw.githubusercontent.com/paulrobinson/lifttrack-app/coach-notes/coach-notes.json

Format (schema 1):
- `date` (YYYY-MM-DD, Europe/London): show notes only when this equals today.
- `session.focus`, `session.note`: shown at the top of the session.
- `exercises["<exact LiftTrack exercise name>"].target` / `.note`: shown under that exercise.
  Exercises not listed get no note. Missing file / fetch error / old date: show nothing.

Never merge this branch into main.
