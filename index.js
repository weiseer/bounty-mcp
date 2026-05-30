#!/usr/bin/env node
/**
 * @weiseer/bounty-mcp
 *
 * Stdio MCP server exposing live coding-bounty deal-flow from verified-escrow GitHub bounties.
 * Self-contained: ships bundled bounties.json; optionally fetches fresh from oracle.weiseer.com.
 *
 * License: Apache-2.0
 * Probe ID: P-002 (organism strategic backlog v2)
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_PATH = join(__dirname, "bounties.json");
const REMOTE_URL =
  process.env.BOUNTY_MCP_URL || "https://oracle.weiseer.com/bounties.json";
const LOCAL_ONLY = !!process.env.BOUNTY_MCP_LOCAL_ONLY;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — bounties move fast

let _cached = null;
let _cachedAt = 0;

async function loadBounties() {
  const now = Date.now();
  if (_cached && now - _cachedAt < CACHE_TTL_MS) return _cached;
  if (!LOCAL_ONLY) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(REMOTE_URL, { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) {
        _cached = await res.json();
        _cached._source = "remote";
        _cachedAt = now;
        return _cached;
      }
    } catch {}
  }
  _cached = JSON.parse(readFileSync(BUNDLED_PATH, "utf-8"));
  _cached._source = "bundled";
  _cachedAt = now;
  return _cached;
}

function _provenance(data) {
  return {
    snapshot_as_of: data.as_of,
    snapshot_source: data._source,
    served_by: "weiseer/bounty-mcp",
    served_at: new Date().toISOString(),
  };
}

function _related_services() {
  return {
    llm_routing: "npx -y @weiseer/llm-oracle-mcp  (LLM pricing + availability)",
    org_index:   "https://github.com/weiseer  (all weiseer services + status dashboard)",
  };
}

function _all(data) {
  return data.bounties || [];
}

// ---- tool handlers ----

async function listBounties({ language, min_dollars, bug_fix_only = false, exclude_assigned = true, exclude_open_pr = true, limit = 50 } = {}) {
  const data = await loadBounties();
  let bs = _all(data);
  if (language) bs = bs.filter((b) => (b.language || "").toLowerCase() === language.toLowerCase());
  if (min_dollars != null) bs = bs.filter((b) => (b.dollars || 0) >= min_dollars);
  if (bug_fix_only) bs = bs.filter((b) => b.is_bug_fix === true);
  if (exclude_assigned) bs = bs.filter((b) => !b.is_assigned);
  if (exclude_open_pr) bs = bs.filter((b) => !b.has_open_pr);
  return {
    ..._provenance(data),
    query: { language, min_dollars, bug_fix_only, exclude_assigned, exclude_open_pr, limit },
    count: Math.min(bs.length, limit),
    bounties: bs.slice(0, limit),
    related_services: _related_services(),
  };
}

async function findMatching({ skills = [], min_dollars = 100, max_attempts = 5, fresh_only = true } = {}) {
  const data = await loadBounties();
  const skillSet = new Set(skills.map((s) => s.toLowerCase()));
  let bs = _all(data).filter((b) => !b.is_assigned && !b.has_open_pr && (b.dollars || 0) >= min_dollars && (b.attempts || 0) <= max_attempts);
  if (skillSet.size > 0) {
    bs = bs.filter((b) => skillSet.has((b.language || "").toLowerCase()));
  }
  bs.sort((a, b) => (b.dollars || 0) - (a.dollars || 0));
  return {
    ..._provenance(data),
    query: { skills, min_dollars, max_attempts, fresh_only },
    count: bs.length,
    matches: bs.slice(0, 20),
    related_services: _related_services(),
  };
}

async function getBounty({ key }) {
  if (!key) return { error: "key required (format: 'owner/repo#issue_num')" };
  const data = await loadBounties();
  const b = _all(data).find((x) => x.key === key);
  if (!b) return { error: `bounty key '${key}' not found in active snapshot` };
  return { ...b, ..._provenance(data) };
}

async function getStats() {
  const data = await loadBounties();
  const bs = _all(data);
  const byLang = {};
  let totalDollars = 0, unclaimed = 0, bugFix = 0;
  for (const b of bs) {
    const l = b.language || "unknown";
    byLang[l] = (byLang[l] || 0) + 1;
    totalDollars += b.dollars || 0;
    if (!b.is_assigned && !b.has_open_pr) unclaimed++;
    if (b.is_bug_fix) bugFix++;
  }
  return {
    ..._provenance(data),
    active_total: bs.length,
    active_unclaimed: unclaimed,
    active_bug_fix: bugFix,
    active_feature: bs.length - bugFix,
    by_language: byLang,
    total_dollars: totalDollars,
    related_services: _related_services(),
  };
}

const TOOLS = [
  {
    name: "list_bounties",
    description: "List live verified-escrow GitHub coding bounties. Filter by language, $ floor, bug-fix only, exclude already-assigned/open-PR.",
    inputSchema: {
      type: "object",
      properties: {
        language: { type: "string", description: "e.g. python, typescript, rust, go" },
        min_dollars: { type: "number", description: "minimum bounty $ amount" },
        bug_fix_only: { type: "boolean", default: false },
        exclude_assigned: { type: "boolean", default: true },
        exclude_open_pr: { type: "boolean", default: true },
        limit: { type: "number", default: 50 },
      },
    },
  },
  {
    name: "find_matching",
    description: "Find bounties matching a skill set + $ floor. Sorted by $ desc. Excludes assigned/active-PR bounties.",
    inputSchema: {
      type: "object",
      properties: {
        skills: { type: "array", items: { type: "string" }, description: "languages/skills, e.g. ['python','rust']" },
        min_dollars: { type: "number", default: 100 },
        max_attempts: { type: "number", default: 5, description: "skip bounties with >N attempts (scam-pattern guard)" },
        fresh_only: { type: "boolean", default: true },
      },
    },
  },
  {
    name: "get_bounty",
    description: "Full record for a single bounty by key (format: 'owner/repo#issue_num').",
    inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] },
  },
  {
    name: "get_stats",
    description: "Aggregate stats on the active bounty pool (total, by language, by bug-fix-vs-feature, total $).",
    inputSchema: { type: "object", properties: {} },
  },
];

const HANDLERS = {
  list_bounties: listBounties,
  find_matching: findMatching,
  get_bounty: getBounty,
  get_stats: getStats,
};

const server = new Server(
  { name: "bounty-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const handler = HANDLERS[name];
  if (!handler) {
    return { content: [{ type: "text", text: JSON.stringify({ error: `unknown tool: ${name}` }) }], isError: true };
  }
  try {
    const result = await handler(args || {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("bounty-mcp connected via stdio\n");
