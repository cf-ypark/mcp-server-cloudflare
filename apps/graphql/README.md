# GraphQL MCP Server

This MCP server provides tools for interacting with Cloudflare's GraphQL API, allowing you to:

- Fetch the GraphQL schema
- Execute GraphQL queries
- Generate GraphQL queries for common analytics use cases
- Analyze zone request patterns and identify spikes

## Available Tools

### GraphQL Schema Exploration

- `graphql_schema_search`: Search the Cloudflare GraphQL API schema for types, fields, and enum values matching a keyword
- `graphql_schema_overview`: Fetch the high-level overview of the Cloudflare GraphQL API schema
- `graphql_type_details`: Fetch detailed information about a specific GraphQL type
- `graphql_complete_schema`: Fetch the complete Cloudflare GraphQL API schema (combines overview and important type details)

### GraphQL Query Execution

- `graphql_query`: Execute a GraphQL query against the Cloudflare API

## Access the remote MCP server from Claude Desktop

Open Claude Desktop and navigate to `Settings -> Developer -> Edit Config`.
This opens the configuration file that controls which MCP servers Claude can access.

Replace the content with the following configuration:

```json
{
	"mcpServers": {
		"cloudflare": {
			"command": "npx",
			"args": ["mcp-remote", "https://graphql.mcp.cloudflare.com/sse"]
		}
	}
}
```

Once you restart Claude Desktop, a browser window will open showing your OAuth login page.
Complete the authentication flow to grant Claude access to your MCP server.
After you grant access, the tools will become available for you to use.

## Setup

#### Secrets

Set secrets via Wrangler:

```bash
npx wrangler secret put CLOUDFLARE_CLIENT_ID -e <ENVIRONMENT>
npx wrangler secret put CLOUDFLARE_CLIENT_SECRET -e <ENVIRONMENT>
```

#### Set up a KV namespace

Create the KV namespace:

```bash
npx wrangler kv namespace create "OAUTH_KV"
```

Then, update the Wrangler file with the generated KV namespace ID.

#### Deploy & Test

Deploy the MCP server to make it available on your workers.dev domain:

```bash
npx wrangler deploy -e <ENVIRONMENT>
```

Test the remote server using [Inspector](https://modelcontextprotocol.io/docs/tools/inspector):

```bash
npx @modelcontextprotocol/inspector@latest
```

## Local Development

If you'd like to iterate and test your MCP server, you can do so in local development.
This will require you to create another OAuth App on Cloudflare:

1. Create a `.dev.vars` file in your project root with:

   ```
   CLOUDFLARE_CLIENT_ID=your_development_cloudflare_client_id
   CLOUDFLARE_CLIENT_SECRET=your_development_cloudflare_client_secret
   ```

2. Start the local development server:

   ```bash
   npx wrangler dev
   ```

3. To test locally, open Inspector, and connect to `http://localhost:8976/sse`.
   Once you follow the prompts, you'll be able to "List Tools".

   You can also connect to Claude Desktop.
