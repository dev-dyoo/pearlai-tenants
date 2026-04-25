// publish-bundle.ts — compile + PutItem to pearlai-tenants DDB table.
// MVP scope: no canary, no history append, no --pin. Just publish the current
// state of clinics/<id>/* to the DDB row.
//
// Usage:
//   tsx scripts/publish-bundle.ts <clinicId>
//
// Env:
//   PEARLAI_TENANTS_TABLE   (default: pearlai-tenants-dev)
//   AWS_REGION              (default: us-west-2)
//   AWS_PROFILE / standard AWS creds chain

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";

import { compileBundle, checkSize } from "./compile-bundle.js";

async function main(): Promise<void> {
  const clinicId = process.argv[2];
  if (!clinicId) {
    console.error("usage: tsx scripts/publish-bundle.ts <clinicId>");
    process.exit(2);
  }

  const tableName = process.env["PEARLAI_TENANTS_TABLE"] ?? "pearlai-tenants-dev";
  const region = process.env["AWS_REGION"] ?? "us-west-2";

  const publishedBy =
    process.env["GITHUB_ACTOR"] ?? process.env["USER"] ?? "local";
  const row = compileBundle(clinicId, publishedBy);
  const bytes = checkSize(row);

  const ddb = new DynamoDBClient({ region });
  const { DynamoDBDocumentClient } = await import("@aws-sdk/lib-dynamodb");
  const doc = DynamoDBDocumentClient.from(ddb);

  await doc.send(
    new PutCommand({
      TableName: tableName,
      Item: row,
    }),
  );

  console.error(
    `published: ${clinicId} sha=${row.bundleSha.slice(0, 12)} bytes=${bytes} → ${tableName}`,
  );
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  void main().catch((err) => {
    console.error("publish failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
