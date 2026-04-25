// validate-bundle.ts — ajv-validate each of the 5 bundle files vs schemas/*,
// then run cross-file checks. Exit non-zero on any error; print findings.
//
// Usage:
//   tsx scripts/validate-bundle.ts             # all clinics
//   tsx scripts/validate-bundle.ts <clinicId>  # one clinic

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "yaml";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

interface Finding {
  clinicId: string;
  file: string;
  rule: string;
  message: string;
}

function loadSchema(name: string): object {
  return JSON.parse(
    readFileSync(resolve(REPO_ROOT, "schemas", `${name}.schema.json`), "utf8"),
  ) as object;
}

function listClinics(): string[] {
  const dir = resolve(REPO_ROOT, "clinics");
  return readdirSync(dir).filter((entry) =>
    statSync(resolve(dir, entry)).isDirectory(),
  );
}

function validateClinic(clinicId: string, ajv: Ajv2020): Finding[] {
  const findings: Finding[] = [];
  const dir = resolve(REPO_ROOT, "clinics", clinicId);

  const files = {
    bundle: { path: "bundle.yaml", schema: "bundle", parse: YAML.parse },
    "tool-manifest": {
      path: "tool-manifest.json",
      schema: "tool-manifest",
      parse: JSON.parse,
    },
    config: { path: "config.json", schema: "config", parse: JSON.parse },
    integrations: {
      path: "integrations.json",
      schema: "integrations",
      parse: JSON.parse,
    },
  } as const;

  const parsed: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(files)) {
    const fullPath = resolve(dir, spec.path);
    let raw: string;
    try {
      raw = readFileSync(fullPath, "utf8");
    } catch (err) {
      findings.push({
        clinicId,
        file: spec.path,
        rule: "file-missing",
        message: `cannot read: ${err instanceof Error ? err.message : err}`,
      });
      continue;
    }
    let parsedDoc: unknown;
    try {
      parsedDoc = spec.parse(raw);
    } catch (err) {
      findings.push({
        clinicId,
        file: spec.path,
        rule: "parse-error",
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    parsed[key] = parsedDoc;
    const validate = ajv.getSchema(`https://pearl.ai/schemas/${spec.schema}.schema.json`);
    if (!validate) {
      findings.push({
        clinicId,
        file: spec.path,
        rule: "schema-missing",
        message: `schema ${spec.schema} not loaded`,
      });
      continue;
    }
    if (!validate(parsedDoc)) {
      for (const e of validate.errors ?? []) {
        findings.push({
          clinicId,
          file: spec.path,
          rule: "schema",
          message: `${e.instancePath || "/"} ${e.message ?? ""}`.trim(),
        });
      }
    }
  }

  // Cross-file checks (only if all parsed cleanly).
  if (parsed.bundle && parsed["tool-manifest"] && parsed.integrations && parsed.config) {
    const bundle = parsed.bundle as { activeIntegrations?: string[] };
    const tm = parsed["tool-manifest"] as {
      tools: Array<{ name: string; adapterRef: string }>;
    };
    const integrations = parsed.integrations as Array<{ integration: string; mode: string }>;
    const config = parsed.config as Record<string, unknown>;

    const declared = new Set(bundle.activeIntegrations ?? []);
    for (const tool of tm.tools) {
      const vendor = tool.adapterRef.split("@")[0];
      if (vendor && !declared.has(vendor)) {
        findings.push({
          clinicId,
          file: "tool-manifest.json",
          rule: "tool-vendor-not-active",
          message: `tool ${tool.name} adapterRef=${tool.adapterRef} but ${vendor} not in bundle.activeIntegrations`,
        });
      }
    }

    const integrationVendors = new Set(integrations.map((i) => i.integration));
    for (const v of declared) {
      if (!integrationVendors.has(v)) {
        findings.push({
          clinicId,
          file: "integrations.json",
          rule: "active-integration-not-declared",
          message: `bundle.activeIntegrations includes ${v} but no entry in integrations.json`,
        });
      }
    }

    const activeVendor = integrations.find((i) => i.mode === "active")?.integration;
    if (activeVendor && !(activeVendor in config)) {
      findings.push({
        clinicId,
        file: "config.json",
        rule: "config-missing-active-integration",
        message: `active integration "${activeVendor}" has no config.json entry`,
      });
    }
  }

  return findings;
}

function main(): void {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats.default(ajv);
  for (const name of ["bundle", "tool-manifest", "config", "integrations"]) {
    ajv.addSchema(loadSchema(name));
  }

  const arg = process.argv[2];
  const clinics = arg ? [arg] : listClinics();
  const all: Finding[] = [];
  for (const c of clinics) {
    all.push(...validateClinic(c, ajv));
  }

  if (all.length === 0) {
    console.error(`validate ok: ${clinics.length} clinic(s) — ${clinics.join(", ")}`);
    return;
  }
  for (const f of all) {
    console.error(`[${f.clinicId}] ${f.file} ${f.rule}: ${f.message}`);
  }
  process.exit(1);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  main();
}
