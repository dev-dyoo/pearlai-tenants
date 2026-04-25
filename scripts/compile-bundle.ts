// compile-bundle.ts — read clinics/<id>/{bundle.yaml,prompt.md,tool-manifest.json,
// config.json,integrations.json} → produce the DDB row shape consumed by
// pearl-app-server (and, eventually, vox-ava).
//
// Usage:
//   tsx scripts/compile-bundle.ts <clinicId>             # prints row JSON to stdout
//   tsx scripts/compile-bundle.ts <clinicId> --dry-run   # validates size, prints summary
//
// Output row shape matches w3-tenants-repo-ci.md §pearlai-tenants table.
// Canary fields intentionally omitted per MVP scope.

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const MAX_ROW_BYTES = 400 * 1024;
const WARN_ROW_BYTES = 300 * 1024;

interface Bundle {
  schemaVersion: string;
  version: string;
  activeIntegrations: string[];
  features?: Record<string, boolean | string | number>;
  opsContacts?: Array<{ name: string; email: string; phone?: string }>;
}

interface ToolManifest {
  tools: Array<Record<string, unknown>>;
}

interface IntegrationDecl {
  integration: string;
  mode: "active" | "webhook" | "polling";
  events?: string[];
  cadenceSec?: number;
}

export interface CompiledRow {
  clinicId: string;
  bundleSha: string;
  bundleVersion: string;
  schemaVersion: string;
  pmsType: string;
  pmsConfig: Record<string, unknown>;
  prompt: string;
  toolManifest: ToolManifest;
  config: Record<string, unknown>;
  integrations: IntegrationDecl[];
  features: Record<string, boolean | string | number>;
  active: boolean;
  lastPublishedAt: string;
  lastPublishedBy: string;
}

function readTextFile(path: string): string {
  return readFileSync(path, "utf8");
}

function contentSha(parts: Record<string, string>): string {
  const hash = createHash("sha256");
  for (const key of Object.keys(parts).sort()) {
    hash.update(key);
    hash.update("\0");
    hash.update(parts[key] ?? "");
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function compileBundle(clinicId: string, publishedBy = "local"): CompiledRow {
  const dir = resolve(REPO_ROOT, "clinics", clinicId);
  if (!statSync(dir).isDirectory()) {
    throw new Error(`clinic dir not found: ${dir}`);
  }

  const bundleYaml = readTextFile(resolve(dir, "bundle.yaml"));
  const prompt = readTextFile(resolve(dir, "prompt.md"));
  const toolManifestRaw = readTextFile(resolve(dir, "tool-manifest.json"));
  const configRaw = readTextFile(resolve(dir, "config.json"));
  const integrationsRaw = readTextFile(resolve(dir, "integrations.json"));

  const bundle = YAML.parse(bundleYaml) as Bundle;
  const toolManifest = JSON.parse(toolManifestRaw) as ToolManifest;
  const config = JSON.parse(configRaw) as Record<string, unknown>;
  const integrations = JSON.parse(integrationsRaw) as IntegrationDecl[];

  const bundleSha = contentSha({
    "bundle.yaml": bundleYaml,
    "prompt.md": prompt,
    "tool-manifest.json": toolManifestRaw,
    "config.json": configRaw,
    "integrations.json": integrationsRaw,
  });

  const activeIntegration = integrations.find((i) => i.mode === "active");
  if (!activeIntegration) {
    throw new Error(
      `no integration with mode=active in clinics/${clinicId}/integrations.json`,
    );
  }
  const pmsType = activeIntegration.integration;
  const adapterConfig = config[pmsType];
  if (!adapterConfig || typeof adapterConfig !== "object") {
    throw new Error(
      `config.json missing top-level key "${pmsType}" for active integration`,
    );
  }

  return {
    clinicId,
    bundleSha,
    bundleVersion: bundle.version,
    schemaVersion: bundle.schemaVersion,
    pmsType,
    pmsConfig: adapterConfig as Record<string, unknown>,
    prompt,
    toolManifest,
    config,
    integrations,
    features: bundle.features ?? {},
    active: true,
    lastPublishedAt: new Date().toISOString(),
    lastPublishedBy: publishedBy,
  };
}

export function checkSize(row: CompiledRow): number {
  const bytes = Buffer.byteLength(JSON.stringify(row), "utf8");
  if (bytes >= MAX_ROW_BYTES) {
    throw new Error(
      `compiled row is ${bytes} bytes — exceeds DynamoDB 400 KB item limit`,
    );
  }
  if (bytes >= WARN_ROW_BYTES) {
    console.error(
      `warn: compiled row is ${bytes} bytes — approaching 400 KB DynamoDB item limit`,
    );
  }
  return bytes;
}

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const positional = args.filter((a) => !a.startsWith("--"));
  const clinicId = positional[0];
  if (!clinicId) {
    console.error("usage: tsx scripts/compile-bundle.ts <clinicId> [--dry-run]");
    process.exit(2);
  }

  const publishedBy = process.env["GITHUB_ACTOR"] ?? process.env["USER"] ?? "local";
  const row = compileBundle(clinicId, publishedBy);
  const bytes = checkSize(row);

  if (dryRun) {
    console.error(
      `compile ok: ${clinicId} sha=${row.bundleSha.slice(0, 12)} bytes=${bytes} pms=${row.pmsType}`,
    );
    return;
  }
  process.stdout.write(JSON.stringify(row, null, 2));
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  main();
}
