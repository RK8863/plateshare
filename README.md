# PlateShare

PlateShare is a static local food rescue exchange prototype. Donors can post surplus food, receivers can claim pickups, and the board tracks open, claimed, and delivered offers with urgency and safety notes.

## Run Locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Deploy On GitHub Pages

This project is ready for GitHub Pages from the repository root. After pushing to GitHub, enable Pages from the `main` branch and `/` root folder.

## Connect Supabase

1. Create a Supabase project.
2. Open the Supabase SQL editor and run `supabase-schema.sql`.
3. Open Project Settings, then API.
4. Copy the Project URL and anon/public key into `supabase-config.js`.

```js
window.PLATESHARE_SUPABASE = {
  url: "https://your-project.supabase.co",
  anonKey: "your-anon-key",
};
```

When those values are present, PlateShare reads and writes offers from Supabase so multiple devices share the same board. Without them, it falls back to local demo data in the browser.
