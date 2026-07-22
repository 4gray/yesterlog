# App icon fallback variants

These 1024x1024 transparent PNG sources are preserved for future TimeBro icon experiments:

- `01-cobalt-check.png`: original cobalt Ticket Bezel with checkmark-shaped clock hands.
- `03-safety-orange.png`: warm graphite and safety-orange industrial treatment.
- `04-light-cobalt.png`: light ivory and cobalt treatment.

The active production source is `../app-icon.png`. To promote a fallback, replace that file with the chosen variant and run:

```bash
npm run assets:icons
```
