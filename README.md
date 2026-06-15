# Taxpayer Info Lookup

A small frontend card for looking up taxpayer information through eBarimt/eTax.

## How It Works

The browser loads the static files:

- `index.html`
- `styles.css`
- `script.js`

The browser does not call `api.ebarimt.mn` directly. Instead it calls:

```text
/api/taxpayer?regNo=5520584
```

On Vercel, `api/taxpayer.js` runs as a tiny backend function. That function calls the two eBarimt endpoints, combines the TIN and taxpayer info, then returns only the data the card needs.

## Deploy To Vercel

1. Create or log in to a Vercel account.
2. Import this GitHub repository in Vercel.
3. Keep the default settings.
4. Deploy.

After deployment, open:

```text
https://your-project-name.vercel.app
```

The lookup card will call:

```text
https://your-project-name.vercel.app/api/taxpayer?regNo=5520584
```

## Local Checks

Run:

```bash
npm run check
```

This checks the JavaScript syntax for both the frontend and the Vercel API function.
