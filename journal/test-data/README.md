# Test data

**This is invented data.** It is shaped to look like a real record so the
journal's dashboards have something to chew on, but no trade in it happened.
It must never be presented to anyone as a track record.

Nothing here reaches the deployed site: `scripts/build-config.js` copies an
allowlist (`index.html`) into `dist/`, so everything else stays in the repo.

## `odyssey-smc-test-record.json`

A three-month smart-money-concepts record. Load it with
**Settings → Restore from a backup** — a snapshot of whatever is in the
journal is taken first, so it is reversible.

| Month | Trades | W/L | Net R | Return |
|---|---|---|---|---|
| Jun 2026 | 20 | 7/11 | +4.00R | +2.00% |
| Jul 2026 | 22 | 8/12 | +7.70R | +3.85% |
| Aug 2026 | 24 | 9/13 | +15.60R | +7.80% |
| Total | 66 | 24/36 | +27.30R | +13.65% |

Three funded accounts at 0.5% risk per trade, so the percentage return is the
same on each and only the dollars differ:

| Account | Size | Net P&L |
|---|---|---|
| FTMO 25K | $25,000 | $3,412.50 |
| Funding Pips 50K | $50,000 | $6,825.00 |
| Alpha Capital 100K | $100,000 | $13,650.00 |

It also carries 5 SMC setups with written plans, 8 confluences tagged per
trade, 14 weekly reviews, 3 lessons, DNA entries, and mistakes on 26 trades
with severities set — enough for the mistake dashboard, Patterns, the edge
score and the confluence charts to have real shape.

## Rebuilding it

```
python3 test-data/generate.py       # trades, accounts, setups, confluences -> parts.json
python3 test-data/build-backup.py   # wraps parts.json in the backup format
```

`generate.py` seeds its RNG, so the output is identical each run. The monthly
returns are not sampled — each month's R-sequence is written to sum exactly to
the target, and `generate.py` prints the totals so a drift is obvious.

To change a month's return, edit `PLAN` in `generate.py`: net R for a month is
`target% / RISK%`, and the R values in the tuple must add up to it.
