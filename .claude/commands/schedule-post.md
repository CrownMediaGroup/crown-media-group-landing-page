Schedule a social media post for future autonomous publishing.

Run: `node Agency/tools/content-scheduler.js` with the provided flags.
standalone-runner.js checks the queue every 60 seconds and fires posts automatically.

Commands:
- Add: `node Agency/tools/content-scheduler.js add --platform <platform> --caption "text" --time "YYYY-MM-DD HH:MM" [--image path] [--video path]`
- List: `node Agency/tools/content-scheduler.js list`
- Cancel: `node Agency/tools/content-scheduler.js cancel <id>`
- History: `node Agency/tools/content-scheduler.js history`
- Run now: `node Agency/tools/content-scheduler.js run`

Platforms: instagram | facebook | x | tiktok | all
Queue file: Agency/ops/content-queue.json

After scheduling, show the full queue with: node Agency/tools/content-scheduler.js list
