# @weiseer/bounty-mcp

> Live coding-bounty deal-flow as a stdio MCP server. For AI agents finding paid coding work.

Built by [weiseer](https://github.com/weiseer). Probe **P-002**.

## What it does

Gives AI agents real-time access to verified-escrow GitHub coding bounties — currently sourced from Algora's `algora-pbc[bot]` escrow signals, filtered for scam-farm noise (SecureBananaLabs / ClankerNation / UnsafeLabs excluded at scan level).

Your agent can:
- `list_bounties` — query the active pool by language, $ floor, bug-fix-only
- `find_matching` — given a skill set + $ floor, return ranked candidates
- `get_bounty` — full record for one bounty
- `get_stats` — aggregate stats (total, by language, unclaimed, $)

## Install

```bash
npm install -g @weiseer/bounty-mcp
```

## Use with Claude Desktop / Cursor / Cline / Continue / Windsurf

```json
{
  "mcpServers": {
    "bounty-mcp": {
      "command": "npx",
      "args": ["-y", "@weiseer/bounty-mcp"]
    }
  }
}
```

## Why use this instead of your agent scraping Algora itself

| | Agent DIY | bounty-mcp |
|---|---|---|
| Token cost per call | $0.02–0.06 (scrape + parse + filter) | $0 free / $0.00005 paid |
| Latency | 2–5 seconds | <100ms |
| Scam filter | Agent must dedupe known scam-farms | Built-in (SecureBananaLabs / ClankerNation / UnsafeLabs excluded at source) |
| Cross-PR / cross-claim check | Agent must run timeline queries | Pre-computed |
| Rate limit risk | 10,000 agents scraping → all blocked | Single coordinated upstream client |

## What's NOT covered (yet)

- Opire / Polar.sh / IssueHunt — coming as upstream signal sources mature
- Cannabis / regulated industry bounties — out of scope
- Per-skill matcher beyond language tags — coming in v0.2

## Schema

See `bounties.json` in the package. Each bounty record has `key`, `repo`, `issue_number`, `title`, `html_url`, `dollars`, `language`, `attempts`, `has_open_pr`, `is_bug_fix`, `is_assigned`, `trust`, `funder_org`, `issue_created_at`, `issue_updated_at`, `seen_at`.

## Environment

- `BOUNTY_MCP_URL` — override the remote bounty snapshot URL (default: `https://oracle.weiseer.com/bounties.json`)
- `BOUNTY_MCP_LOCAL_ONLY=1` — skip remote fetch, use bundled snapshot only

## Related weiseer services

- [`@weiseer/llm-oracle-mcp`](https://www.npmjs.com/package/@weiseer/llm-oracle-mcp) — LLM provider pricing + availability oracle (P-001)
- [github.com/weiseer](https://github.com/weiseer) — all weiseer services + status

## License

Apache-2.0. Catalog format: MIT.

## Roadmap

Probe-pulled. What gets added is what users request via issues.
