#!/usr/bin/env bash
# prompt-version — versioned agent prompts in DynamoDB.
#
#   save     <clinicId> <file.md> [notes]   create next version, optionally activate
#   list     <clinicId>                      list versions, mark active
#   activate <clinicId> <version|latest>     set active version + push to tenant record
#   show     <clinicId> <version|latest>     dump version content to stdout
#
# Versions live in DynamoDB pearlai-portal-prompt-versions-test:
#   PK=CLINIC#<id>  SK=v<NNN>      version, content, createdAt, createdBy, notes
#   PK=CLINIC#<id>  SK=ACTIVE      activeVersion, activatedAt, activatedBy
#
# `activate` also writes the version's content to the tenant record's
# `agentPrompt` field in pearlai-portal-tenants-{env} so vox-ava picks it up
# on its next per-call read — no service restart needed.
#
# Env: AWS_PROFILE (default pearldev-admin), AWS_REGION (default us-west-2),
# PROMPT_TABLE, TENANTS_TABLE.

set -euo pipefail

PROFILE="${AWS_PROFILE:-pearldev-admin}"
REGION="${AWS_REGION:-us-west-2}"
PROMPT_TABLE="${PROMPT_TABLE:-pearlai-portal-prompt-versions-test}"
TENANTS_TABLE="${TENANTS_TABLE:-pearlai-portal-tenants-test}"

aws_() { aws --profile "$PROFILE" --region "$REGION" "$@"; }

usage() {
  sed -n '1,/^set -euo/p' "$0" | sed -n '2,/^$/p' | sed 's/^# \{0,1\}//'
  exit 64
}

iso_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

pad() { printf "v%03d" "$1"; }

next_version() {
  local clinic="$1"
  aws_ dynamodb query \
    --table-name "$PROMPT_TABLE" \
    --key-condition-expression "PK = :p AND begins_with(SK, :s)" \
    --expression-attribute-values "{\":p\":{\"S\":\"CLINIC#$clinic\"},\":s\":{\"S\":\"v\"}}" \
    --projection-expression "version" \
    --output json 2>/dev/null \
    | jq '[.Items[].version.N | tonumber] | (max // 0) + 1'
}

active_version() {
  local clinic="$1"
  aws_ dynamodb get-item \
    --table-name "$PROMPT_TABLE" \
    --key "{\"PK\":{\"S\":\"CLINIC#$clinic\"},\"SK\":{\"S\":\"ACTIVE\"}}" \
    --projection-expression "activeVersion" \
    --output json 2>/dev/null \
    | jq -r '.Item.activeVersion.N // "none"'
}

resolve_version() {
  local clinic="$1" arg="$2"
  if [ "$arg" = "latest" ]; then
    aws_ dynamodb query \
      --table-name "$PROMPT_TABLE" \
      --key-condition-expression "PK = :p AND begins_with(SK, :s)" \
      --expression-attribute-values "{\":p\":{\"S\":\"CLINIC#$clinic\"},\":s\":{\"S\":\"v\"}}" \
      --projection-expression "version" \
      --output json 2>/dev/null \
      | jq -r '[.Items[].version.N | tonumber] | max // empty'
  else
    echo "$arg"
  fi
}

cmd_save() {
  local clinic="${1:?clinicId required}" file="${2:?file required}" notes="${3:-}"
  [ -f "$file" ] || { echo "file not found: $file" >&2; exit 2; }
  local content; content=$(cat "$file")
  local version; version=$(next_version "$clinic")
  local sk; sk=$(pad "$version")
  local size=${#content}
  local who="${USER:-unknown}@$(hostname -s 2>/dev/null || echo host)"

  jq -n --arg pk "CLINIC#$clinic" --arg sk "$sk" --arg n "$version" --arg c "$content" \
        --arg now "$(iso_now)" --arg who "$who" --arg notes "$notes" --arg size "$size" '
    {
      "PK":{"S":$pk}, "SK":{"S":$sk},
      "version":{"N":$n},
      "content":{"S":$c},
      "createdAt":{"S":$now},
      "createdBy":{"S":$who},
      "notes":{"S":$notes},
      "size":{"N":$size}
    }' > /tmp/prompt-save.json

  aws_ dynamodb put-item --table-name "$PROMPT_TABLE" --item file:///tmp/prompt-save.json \
    --condition-expression "attribute_not_exists(SK)" >/dev/null
  rm -f /tmp/prompt-save.json
  echo "saved $clinic $sk ($size chars)"
}

cmd_list() {
  local clinic="${1:?clinicId required}"
  local active; active=$(active_version "$clinic")
  echo "active: v$(printf %03d "$active" 2>/dev/null || echo "$active")"
  aws_ dynamodb query \
    --table-name "$PROMPT_TABLE" \
    --key-condition-expression "PK = :p AND begins_with(SK, :s)" \
    --expression-attribute-values "{\":p\":{\"S\":\"CLINIC#$clinic\"},\":s\":{\"S\":\"v\"}}" \
    --output json \
    | jq -r --arg a "$active" '
      .Items
      | sort_by(.version.N | tonumber)
      | .[]
      | "\(if .version.N == $a then "* " else "  " end)v\(.version.N|tonumber|tostring|("000"+.)|.[length-3:])  \(.size.N) chars  \(.createdAt.S)  by \(.createdBy.S)\(if .notes.S != "" then "  — \(.notes.S)" else "" end)"
    '
}

cmd_activate() {
  local clinic="${1:?clinicId required}" arg="${2:?version|latest required}"
  local version; version=$(resolve_version "$clinic" "$arg")
  [ -n "$version" ] || { echo "no version found" >&2; exit 2; }
  local sk; sk=$(pad "$version")
  local who="${USER:-unknown}@$(hostname -s 2>/dev/null || echo host)"

  # Fetch the version's content
  local content
  content=$(aws_ dynamodb get-item --table-name "$PROMPT_TABLE" \
    --key "{\"PK\":{\"S\":\"CLINIC#$clinic\"},\"SK\":{\"S\":\"$sk\"}}" \
    --projection-expression "content" --output json | jq -r '.Item.content.S')
  [ -n "$content" ] && [ "$content" != "null" ] || { echo "version $sk has no content" >&2; exit 2; }

  # Atomic update: ACTIVE pointer + tenant agentPrompt in one transaction.
  jq -n --arg pk "CLINIC#$clinic" --arg n "$version" --arg now "$(iso_now)" \
        --arg who "$who" --arg c "$content" --arg tt "$TENANTS_TABLE" '
    {
      "TransactItems": [
        {
          "Put": {
            "TableName": "'$PROMPT_TABLE'",
            "Item": {
              "PK":{"S":$pk}, "SK":{"S":"ACTIVE"},
              "activeVersion":{"N":$n},
              "activatedAt":{"S":$now},
              "activatedBy":{"S":$who}
            }
          }
        },
        {
          "Update": {
            "TableName": $tt,
            "Key": {"PK":{"S":$pk}, "SK":{"S":"METADATA"}},
            "UpdateExpression": "SET agentPrompt = :p, updatedAt = :u, updatedBy = :b",
            "ExpressionAttributeValues": {
              ":p":{"S":$c}, ":u":{"S":$now}, ":b":{"S":("prompt-version/v"+$n)}
            }
          }
        }
      ]
    }' > /tmp/prompt-activate.json

  aws_ dynamodb transact-write-items --cli-input-json file:///tmp/prompt-activate.json
  rm -f /tmp/prompt-activate.json
  echo "activated $clinic v$(printf %03d "$version") (${#content} chars now live in $TENANTS_TABLE)"
}

cmd_show() {
  local clinic="${1:?clinicId required}" arg="${2:?version|latest required}"
  local version; version=$(resolve_version "$clinic" "$arg")
  [ -n "$version" ] || { echo "no version found" >&2; exit 2; }
  local sk; sk=$(pad "$version")
  aws_ dynamodb get-item --table-name "$PROMPT_TABLE" \
    --key "{\"PK\":{\"S\":\"CLINIC#$clinic\"},\"SK\":{\"S\":\"$sk\"}}" \
    --projection-expression "content" --output json | jq -r '.Item.content.S'
}

case "${1:-}" in
  save)     shift; cmd_save "$@" ;;
  list)     shift; cmd_list "$@" ;;
  activate) shift; cmd_activate "$@" ;;
  show)     shift; cmd_show "$@" ;;
  *)        usage ;;
esac
