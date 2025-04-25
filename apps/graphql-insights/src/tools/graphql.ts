import { z } from 'zod'

import type { GraphQLInsightsMCP } from '../index'

// Schema for GraphQL query parameters
const zoneIdParam = z.string().describe('The Cloudflare zone ID to query')
const accountIdParam = z.string().describe('The Cloudflare account ID to query')
const timeRangeParam = z.object({
  since: z.string().describe('Start time in ISO format'),
  until: z.string().describe('End time in ISO format'),
}).describe('Time range for the query')
const limitParam = z.number().min(1).max(10000).default(100).describe('Maximum number of results to return')

// GraphQL API endpoint
const CLOUDFLARE_GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql'

// Type definitions for GraphQL schema responses
interface GraphQLTypeRef {
  kind: string;
  name: string | null;
  ofType?: GraphQLTypeRef | null;
}

interface GraphQLField {
  name: string;
  description: string | null;
  args: Array<{
    name: string;
    description: string | null;
    type: GraphQLTypeRef;
  }>;
  type: GraphQLTypeRef;
}

interface GraphQLType {
  name: string;
  kind: string;
  description: string | null;
  fields?: GraphQLField[] | null;
  inputFields?: Array<{
    name: string;
    description: string | null;
    type: GraphQLTypeRef;
  }> | null;
  interfaces?: Array<{ name: string }> | null;
  enumValues?: Array<{
    name: string;
    description: string | null;
  }> | null;
  possibleTypes?: Array<{ name: string }> | null;
}

interface SchemaOverviewResponse {
  data: {
    __schema: {
      queryType: { name: string } | null;
      mutationType: { name: string } | null;
      subscriptionType: { name: string } | null;
      types: Array<{
        name: string;
        kind: string;
        description: string | null;
      }>;
    };
  };
}

interface TypeDetailsResponse {
  data: {
    __type: GraphQLType;
  };
}

interface SchemaResponse {
  data: {
    __schema: {
      queryType: { name: string } | null;
      mutationType: { name: string } | null;
      subscriptionType: { name: string } | null;
      types: Array<{
        name: string;
        kind: string;
        description: string | null;
      }>;
    };
  };
  typeDetails: Record<string, GraphQLType>;
}

/**
 * Fetches the GraphQL schema from Cloudflare's API using a progressive approach
 * @param accountId Cloudflare account ID
 * @param apiToken Cloudflare API token
 * @returns The GraphQL schema built progressively
 */
async function fetchGraphQLSchema(accountId: string, apiToken: string): Promise<SchemaResponse> {
  // Step 1: Fetch the high-level schema structure (root types and type names)
  const schemaOverview = await fetchSchemaOverview(accountId, apiToken)
  
  // Initialize the schema object with the overview data
  const schema: SchemaResponse = {
    data: schemaOverview.data,
    typeDetails: {}
  }
  
  // Step 2: For important root types, fetch their details
  // This demonstrates the progressive approach - we could expand this to fetch more types as needed
  const rootTypes = [
    schemaOverview.data.__schema.queryType?.name,
    // Only include mutation type if it exists
    ...(schemaOverview.data.__schema.mutationType?.name ? [schemaOverview.data.__schema.mutationType.name] : [])
  ].filter(Boolean) as string[]
  
  // Fetch details for root operation types
  for (const typeName of rootTypes) {
    try {
      const typeDetails = await fetchTypeDetails(typeName, accountId, apiToken)
      if (typeDetails.data.__type) {
        schema.typeDetails[typeName] = typeDetails.data.__type
      }
    } catch (error) {
      console.error(`Error fetching details for type ${typeName}:`, error)
    }
  }
  
  return schema
}

/**
 * Fetches the high-level overview of the GraphQL schema
 * @param accountId Cloudflare account ID
 * @param apiToken Cloudflare API token
 * @returns Basic schema structure
 */
async function fetchSchemaOverview(accountId: string, apiToken: string): Promise<SchemaOverviewResponse> {
  const overviewQuery = `
    query SchemaOverview {
      __schema {
        queryType { name }
        mutationType { name }
        subscriptionType { name }
        types {
          name
          kind
          description
        }
      }
    }
  `

  const response = await executeGraphQLRequest<SchemaOverviewResponse>(overviewQuery, accountId, apiToken)
  return response
}

/**
 * Fetches detailed information about a specific GraphQL type
 * @param typeName The name of the type to fetch details for
 * @param accountId Cloudflare account ID
 * @param apiToken Cloudflare API token
 * @returns Detailed type information
 */
async function fetchTypeDetails(typeName: string, accountId: string, apiToken: string): Promise<TypeDetailsResponse> {
  const typeDetailsQuery = `
    query TypeDetails {
      __type(name: "${typeName}") {
        name
        kind
        description
        fields(includeDeprecated: false) {
          name
          description
          args {
            name
            description
            type {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
        inputFields {
          name
          description
          type {
            kind
            name
            ofType {
              kind
              name
            }
          }
        }
        interfaces {
          name
        }
        enumValues(includeDeprecated: false) {
          name
          description
        }
        possibleTypes {
          name
        }
      }
    }
  `

  const response = await executeGraphQLRequest<TypeDetailsResponse>(typeDetailsQuery, accountId, apiToken)
  return response
}

/**
 * Helper function to execute GraphQL requests
 * @param query GraphQL query to execute
 * @param accountId Cloudflare account ID
 * @param apiToken Cloudflare API token
 * @returns Response data
 */
async function executeGraphQLRequest<T>(query: string, accountId: string, apiToken: string): Promise<T> {
  const response = await fetch(CLOUDFLARE_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    throw new Error(`Failed to execute GraphQL request: ${response.statusText}`)
  }

  const data = await response.json() as any
  
  // Check for GraphQL errors in the response
  if (data && data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
    const errorMessages = data.errors.map((e: { message: string }) => e.message).join(', ')
    console.warn(`GraphQL errors: ${errorMessages}`)
    
    // If the error is about mutations not being supported, we can handle it gracefully
    if (errorMessages.includes('Mutations are not supported')) {
      console.info('Mutations are not supported by the Cloudflare GraphQL API')
    }
  }
  
  return data as T
}

/**
 * Executes a GraphQL query against Cloudflare's API
 * @param query The GraphQL query to execute
 * @param variables Variables for the query
 * @param accountId Cloudflare account ID
 * @param apiToken Cloudflare API token
 * @returns The query results
 */
async function executeGraphQLQuery(query: string, variables: any, accountId: string, apiToken: string) {
  const response = await fetch(CLOUDFLARE_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to execute GraphQL query: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Registers GraphQL tools with the MCP server
 * @param agent The MCP agent instance
 */
export function registerGraphQLTools(agent: GraphQLInsightsMCP) {
  // Tool to fetch the GraphQL schema overview (high-level structure)
  agent.server.tool(
    'graphql_schema_overview',
    'Fetch the high-level overview of the Cloudflare GraphQL API schema',
    {},
    async () => {
      const accountId = agent.getActiveAccountId()
      if (!accountId) {
        return {
          content: [
            {
              type: 'text',
              text: 'No currently active accountId. Try listing your accounts (accounts_list) and then setting an active account (set_active_account)',
            },
          ],
        }
      }

      try {
        const schemaOverview = await fetchSchemaOverview(accountId, agent.props.accessToken)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(schemaOverview),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Error fetching GraphQL schema overview: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
        }
      }
    }
  )

  // Tool to fetch detailed information about a specific GraphQL type
  agent.server.tool(
    'graphql_type_details',
    'Fetch detailed information about a specific GraphQL type',
    {
      typeName: z.string().describe('The name of the GraphQL type to fetch details for'),
    },
    async (params) => {
      const accountId = agent.getActiveAccountId()
      if (!accountId) {
        return {
          content: [
            {
              type: 'text',
              text: 'No currently active accountId. Try listing your accounts (accounts_list) and then setting an active account (set_active_account)',
            },
          ],
        }
      }

      try {
        const { typeName } = params
        const typeDetails = await fetchTypeDetails(typeName, accountId, agent.props.accessToken)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(typeDetails),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Error fetching type details: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
        }
      }
    }
  )
  
  // Tool to fetch the complete GraphQL schema (combines overview and important type details)
  agent.server.tool(
    'graphql_schema',
    'Fetch the complete Cloudflare GraphQL API schema (combines overview and important type details)',
    {},
    async () => {
      const accountId = agent.getActiveAccountId()
      if (!accountId) {
        return {
          content: [
            {
              type: 'text',
              text: 'No currently active accountId. Try listing your accounts (accounts_list) and then setting an active account (set_active_account)',
            },
          ],
        }
      }

      try {
        const schema = await fetchGraphQLSchema(accountId, agent.props.accessToken)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(schema),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Error fetching GraphQL schema: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
        }
      }
    }
  )

  // Tool to execute a GraphQL query
  agent.server.tool(
    'graphql_query',
    'Execute a GraphQL query against the Cloudflare API',
    {
      query: z.string().describe('The GraphQL query to execute'),
      variables: z.record(z.any()).optional().describe('Variables for the query'),
    },
    async (params) => {
      const accountId = agent.getActiveAccountId()
      if (!accountId) {
        return {
          content: [
            {
              type: 'text',
              text: 'No currently active accountId. Try listing your accounts (accounts_list) and then setting an active account (set_active_account)',
            },
          ],
        }
      }

      try {
        const { query, variables = {} } = params
        const result = await executeGraphQLQuery(query, variables, accountId, agent.props.accessToken)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Error executing GraphQL query: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
        }
      }
    }
  )

  // Tool to generate a GraphQL query for zone analytics
  agent.server.tool(
    'generate_zone_analytics_query',
    'Generate a GraphQL query for zone analytics',
    {
      zoneId: zoneIdParam,
      metric: z.string().describe('The metric to query (e.g., requests, bandwidth, threats)'),
      timeRange: timeRangeParam,
      dimensions: z.array(z.string()).optional().describe('Dimensions to group by'),
      filters: z.record(z.string()).optional().describe('Filters to apply to the query'),
      limit: limitParam,
    },
    async (params) => {
      const { zoneId, metric, timeRange, dimensions = [], filters = {}, limit } = params

      // Build the GraphQL query
      const query = `
        query ZoneAnalytics($zoneId: String!, $filter: ZoneAnalyticsFilter!) {
          viewer {
            zones(filter: { zoneTag: $zoneId }) {
              httpRequests1dGroups(limit: ${limit}, filter: $filter) {
                dimensions {
                  ${dimensions.join('\n')}
                }
                sum {
                  ${metric}
                }
                uniq {
                  uniques
                }
              }
            }
          }
        }
      `

      // Build the variables
      const variables = {
        zoneId,
        filter: {
          date_geq: timeRange.since,
          date_leq: timeRange.until,
          ...filters,
        },
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              query,
              variables,
            }),
          },
        ],
      }
    }
  )

  // Tool to generate a GraphQL query for account analytics
  agent.server.tool(
    'generate_account_analytics_query',
    'Generate a GraphQL query for account-level analytics',
    {
      accountId: accountIdParam,
      metric: z.string().describe('The metric to query (e.g., requests, bandwidth, threats)'),
      timeRange: timeRangeParam,
      dimensions: z.array(z.string()).optional().describe('Dimensions to group by'),
      filters: z.record(z.string()).optional().describe('Filters to apply to the query'),
      limit: limitParam,
    },
    async (params) => {
      const { accountId, metric, timeRange, dimensions = [], filters = {}, limit } = params

      // Build the GraphQL query
      const query = `
        query AccountAnalytics($accountId: String!, $filter: AccountAnalyticsFilter!) {
          viewer {
            accounts(filter: { accountTag: $accountId }) {
              httpRequests1dGroups(limit: ${limit}, filter: $filter) {
                dimensions {
                  ${dimensions.join('\n')}
                }
                sum {
                  ${metric}
                }
                uniq {
                  uniques
                }
              }
            }
          }
        }
      `

      // Build the variables
      const variables = {
        accountId,
        filter: {
          date_geq: timeRange.since,
          date_leq: timeRange.until,
          ...filters,
        },
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              query,
              variables,
            }),
          },
        ],
      }
    }
  )


}
