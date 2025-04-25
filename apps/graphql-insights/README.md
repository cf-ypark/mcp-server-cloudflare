# GraphQL Insights MCP Server

This MCP server provides tools for interacting with Cloudflare's GraphQL API, allowing you to:

- Fetch the GraphQL schema
- Execute GraphQL queries
- Generate GraphQL queries for common analytics use cases
- Analyze zone request patterns and identify spikes

## Getting Started

1. Copy `.dev.vars.example` to `.dev.vars` and fill in your Cloudflare API credentials
2. Run `npm run dev` to start the development server
3. Visit `http://localhost:8787` to access the server

## Available Tools

### GraphQL Schema Exploration
- `graphql_schema_overview`: Fetch the high-level overview of the Cloudflare GraphQL API schema
- `graphql_type_details`: Fetch detailed information about a specific GraphQL type
- `graphql_schema`: Fetch the complete Cloudflare GraphQL API schema (combines overview and important type details)

### GraphQL Query Execution
- `graphql_query`: Execute a GraphQL query against the Cloudflare API

### Query Generation
- `generate_zone_analytics_query`: Generate a GraphQL query for zone analytics
- `generate_account_analytics_query`: Generate a GraphQL query for account-level analytics
