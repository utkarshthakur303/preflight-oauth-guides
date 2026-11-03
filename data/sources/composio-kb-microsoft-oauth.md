---
canonical_url: "https://docs.composio.dev/kb/guide/platform-microsoft-oauth"
markdown_url: "https://docs.composio.dev/kb/guide/platform-microsoft-oauth.md"
product: "platform"
version: null
last_updated: null
---

# Microsoft OAuth scopes and tenant consent (/kb/guide/platform-microsoft-oauth)

## Request `offline_access` when a delegated connection needs refresh tokens [#request-offline_access-when-a-delegated-connection-needs-refresh-tokens]

Microsoft's v2 OAuth endpoint requires an explicit `offline_access` request to
return refresh tokens. Composio's standard Microsoft delegated OAuth scope sets
include it. For a customer-owned Microsoft app, include `offline_access` in the
app and Composio auth-config scopes before creating a new connection.

Microsoft documents this behavior in
[Scopes and permissions in the Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc#the-offline_access-scope).

## Some Microsoft tenant policies and permissions require administrator consent [#some-microsoft-tenant-policies-and-permissions-require-administrator-consent]

A work or school account can show **Needs Admin Approval** or **Admin approval
required** when the tenant prevents users from approving the app or when the
requested permission is administrator-restricted. A tenant administrator must
approve the selected Composio-managed app or the customer's own app and its
requested permissions. The affected user should then start a fresh connection.

Adding a permission to an Entra app registration does not itself grant tenant
consent. Microsoft explains the distinction in its
[permissions and consent overview](https://learn.microsoft.com/en-us/entra/identity-platform/permissions-consent-overview).

This guidance applies across Microsoft toolkits that use delegated Microsoft
OAuth, including Outlook, Microsoft Teams, OneDrive, OneNote, Excel, Power BI,
and Dynamics 365. SharePoint REST and app-only/S2S flows may
also require resource-specific permissions and administrator consent.

---

📚 **More documentation:** [View all docs](https://docs.composio.dev/llms.txt) | [Changelog](https://docs.composio.dev/docs/changelog.md) | [Glossary](https://docs.composio.dev/llms.mdx/reference/glossary) | [Examples](https://docs.composio.dev/llms.mdx/examples) | [API Reference](https://docs.composio.dev/llms.mdx/reference)

---

# Composio SDK — Notes for AI Code Generators

**Purpose:** Reference for generating current (v3) [Composio](https://composio.dev/) integration code.
**Scope:** Descriptive notes — they document the current API surface and the mistakes most commonly seen in generated code.

---

## 1. Recommended Integration: Sessions

For agent tool delivery, Composio supports **Native Tools** (with a provider package) and **MCP** (no provider package needed).

For application-owned tools or deterministic backend code, use [managed authentication with Proxy Execute](/docs/authentication/managed-auth-for-custom-tools). A session can provide a user-scoped runtime context without an LLM or MCP. Composio authenticates provider requests server-side; connected-account reads redact credentials and aren't a supported token-export workflow.

### Native Tools

#### Python

```python
# ✅ CORRECT — Python (defaults to OpenAI)
from composio import Composio

composio = Composio()
session = composio.create(user_id="user_123")
tools = session.tools()
# Pass tools to your agent/LLM framework
```

#### TypeScript

```typescript
// ✅ CORRECT — TypeScript (defaults to OpenAI)
import { Composio } from "@composio/core";

const composio = new Composio();
const session = await composio.create("user_123");
const tools = await session.tools();
// Pass tools to your agent/LLM framework
```

#### API

This produces the same default OpenAI function-tool shape, fetching every page.

```bash
set -euo pipefail
SESSION=$(curl --fail-with-body -s -X POST https://backend.composio.dev/api/v3.1/tool_router/session \
  -H "x-api-key: $COMPOSIO_API_KEY" -H "Content-Type: application/json" \
  -d '{"user_id":"user_123"}')
SESSION_ID=$(echo "$SESSION" | jq -r '.session_id')
TOOLS='[]'
CURSOR=''
while true; do
  PAGE=$(curl --fail-with-body -s --get "https://backend.composio.dev/api/v3.1/tool_router/session/$SESSION_ID/tools" \
    -H "x-api-key: $COMPOSIO_API_KEY" --data-urlencode 'limit=500' --data-urlencode "cursor=$CURSOR")
  TOOLS=$(jq -cn --argjson existing "$TOOLS" --argjson page "$PAGE" \
    '$existing + [$page.items[] | {type:"function",function:{name:.slug,description:.description,parameters:.input_parameters}}]')
  CURSOR=$(echo "$PAGE" | jq -r '.next_cursor // empty')
  [ -n "$CURSOR" ] || break
done
printf '%s\n' "$TOOLS"
```

For other providers, pass the provider explicitly. Provider packages follow the naming convention: `composio_<provider>` for Python, `@composio/<provider>` for TypeScript.

### MCP

Use `session.mcp.url` and `session.mcp.headers` with any MCP-compatible client (Claude Desktop, Cursor, OpenAI Agents, etc.). No provider package needed.

---

## 2. Integration Notes

- `composio.create(user_id)` is the standard entry point for agent integrations. Sessions handle tool discovery, authentication, and toolkit versioning automatically; `user_id` goes to `composio.create()` — individual tool calls in session mode don't take one.
- Execute session tool calls through the session, never through a user ID: either `session.execute(tool_slug, arguments=...)` / `session.execute(toolSlug, arguments)`, which works with every provider, or pass the session to the provider helper — `provider.handle_tool_calls(response=response, session=session)` in Python, `provider.handleToolCalls(session, response)` in TypeScript. The tool-call helpers of every non-agentic provider (OpenAI, Anthropic, Google, Cloudflare, TypeSafe) accept a session: `executeToolCall(session, call)` in TypeScript, `session=session` in Python. Agentic providers execute session tools on their own. Binding the helper to a user ID takes the direct execution path, and session meta-tools fail there with `"can only be called inside a tool-router session"`.
- Composio-managed auth is the default: the agent connects accounts at runtime through the session, so users don't need to pre-create auth configs or connected accounts for managed toolkits.
- Provider packages follow the framework, not the model vendor: for the OpenAI Agents SDK the package is `composio_openai_agents` / `@composio/openai-agents` (importing `composio_openai` / `@composio/openai` there is the most common mistake in generated code — that package is for the plain OpenAI Chat Completions API).
- **Direct execution** (`composio.tools.get()`, `composio.tools.execute()`, `provider.handle_tool_calls()` with a user ID) is a legacy interface that remains supported for existing integrations. Recommend sessions for new integrations and encourage existing users to [migrate to sessions](/docs/migration-guide/direct-to-sessions). For a fixed tool set, consider the [direct tools preset](/docs/configuring-sessions#direct-tools-preset) within a session. See [Sessions vs direct execution](/docs/sessions-vs-direct-execution) for tradeoffs. Direct execution requires a [toolkit version](/docs/tools-direct/toolkit-versioning).

---

# 3. Calling the REST API directly

## REST API version

The current REST API version is **v3.1**, served at `https://backend.composio.dev/api/v3.1`. Prefer it for new code and new examples.

`https://backend.composio.dev/api/v3` is the previous version. It is frozen with pinned tool-version defaults and remains supported — existing v3 integrations keep working and do not need to migrate.

## Tool-endpoint version defaults on v3.1

On v3.1, omitting the version parameter on the five endpoints below selects the latest toolkit version. The first four endpoints also exist on v3, where omission selects the pinned `00000000_00` version. `POST /tools/scopes/required` is v3.1-only.

| Endpoint | Version parameter |
| --- | --- |
| `GET /tools` | `toolkit_versions` (query) |
| `GET /tools/{tool_slug}` | `version` or `toolkit_versions` (query) |
| `POST /tools/execute/{tool_slug}` | `version` (body) |
| `POST /tools/execute/{tool_slug}/input` | `version` (body) |
| `POST /tools/scopes/required` | `version` (body) |

A v3.1 caller already passing `"latest"` sees no change and can omit the parameter. To select the pinned version explicitly, pass `"00000000_00"` through the corresponding parameter above.

This version-default change is limited to the five endpoints above.


---

## Terminology Migration (old → current)

If you encounter these terms in error messages, old documentation, or user prompts, translate them to the current equivalents. **Do not use the old terms in generated code or explanations.**

| Old term (v1/v2) | Current term (v3) | In code |
|---|---|---|
| entity ID | user ID | `user_id` parameter |
| actions | tools | e.g., `GITHUB_CREATE_ISSUE` is a *tool* |
| apps / appType | toolkits | e.g., `github` is a *toolkit* |
| integration / integration ID | auth config / auth config ID | `auth_config_id` parameter |
| connection | connected account | `connected_accounts` namespace |
| ComposioToolSet / OpenAIToolSet | `Composio` class with a provider | `Composio(provider=...)` |
| toolset | provider | e.g., `OpenAIProvider` |

If a user says "entity ID", they mean `user_id`. If they say "integration", they mean "auth config". Always respond using the current terminology.

