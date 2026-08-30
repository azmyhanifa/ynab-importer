# YNAB Importer

Paste bank SMS (or drop an Excel/CSV statement) and push the transactions into [YNAB](https://www.ynab.com). Built for banks that don't link — UAE in particular.

**Live:** [ynabimporter.azmyhanifa.com](https://ynabimporter.azmyhanifa.com/)

Not a product. No account, no waitlist, no backend of mine.

## Privacy

There are **no environment variables** and **no server-side secrets**. The app is a static Next.js frontend. I do not get a copy of your data, and I do not use it for anything.

- Your YNAB [personal access token](https://api.ynab.com/#personal-access-tokens) is stored in `localStorage` on your machine
- SMS, statements, payee maps, and card mappings stay in `localStorage` too
- API calls go **browser → `api.ynab.com`**. Nothing is sent to a server I control
- Nothing is sold, shared, trained on, or synced across devices
- "Learns your formatting" is regex / pattern matching plus payee mappings in `localStorage`. No AI, no LLM

If you'd rather not paste a token into a hosted page, run it locally.

The hosted Vercel deploy has [Vercel Analytics](https://vercel.com/docs/analytics) page views. That is page hits only — not your token, SMS, or budget.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No `.env` file. No API keys to configure.

```bash
npx tsx scripts/verify-sms-parser.ts
```

## Use it

1. Create a token in YNAB → Account Settings → Developer Settings
2. Paste it in the app
3. Copy a bunch of bank SMS (or drop a statement) and confirm the rows
4. Push into the YNAB account you pick

Card last-4 → YNAB account mappings and payee/category choices stick in `localStorage`.

## Disclaimer

We are not affiliated, associated, or in any way officially connected with YNAB or any of its subsidiaries or affiliates. The official YNAB website can be found at [https://www.ynab.com](https://www.ynab.com).

The names YNAB and You Need A Budget, as well as related names, tradenames, marks, trademarks, emblems, and images are registered trademarks of YNAB.

## License

MIT
