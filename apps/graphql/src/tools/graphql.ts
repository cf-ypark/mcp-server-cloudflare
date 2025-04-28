import { z } from 'zod'

import type { GraphQLMCP } from '../index'

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
 * Executes a GraphQL query against Cloudflare's API with pagination support
 * @param query The GraphQL query to execute
 * @param variables Variables for the query
 * @param accountId Cloudflare account ID
 * @param apiToken Cloudflare API token
 * @param paginationOptions Optional pagination options
 * @returns The query results with pagination metadata
 */
async function executeGraphQLQuery(query: string, variables: any, accountId: string, apiToken: string, paginationOptions?: {
  paginationPath?: string; // JSON path to the array that needs pagination (e.g., 'data.viewer.zones')
  pageSize?: number;        // Number of items per page
  page?: number;            // Current page number
}) {
  // Clone the variables to avoid modifying the original
  const queryVariables = { ...variables }
  
  // Add pagination variables if needed
  if (paginationOptions?.paginationPath) {
    // Some GraphQL APIs use limit/offset for pagination
    if (paginationOptions.pageSize) {
      queryVariables.limit = paginationOptions.pageSize
      
      if (paginationOptions.page && paginationOptions.page > 1) {
        queryVariables.offset = (paginationOptions.page - 1) * paginationOptions.pageSize
      }
    }
  }
  
  const response = await fetch(CLOUDFLARE_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      query,
      variables: queryVariables,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to execute GraphQL query: ${response.statusText}`)
  }

  const result = await response.json() as any
  
  // Check for GraphQL errors in the response
  if (result && result.errors && Array.isArray(result.errors) && result.errors.length > 0) {
    const errorMessages = result.errors.map((e: { message: string }) => e.message).join(', ')
    console.warn(`GraphQL query errors: ${errorMessages}`)
  }
  
  // If pagination was requested, add pagination metadata
  if (paginationOptions?.paginationPath && result) {
    // Get the data at the pagination path
    const pathParts = paginationOptions.paginationPath.split('.')
    let data: any = result
    
    for (const part of pathParts) {
      if (data && typeof data === 'object' && part in data) {
        data = data[part]
      } else {
        data = null
        break
      }
    }
    
    // If we found an array at the pagination path, add pagination metadata
    if (Array.isArray(data)) {
      const totalItems = data.length
      const pageSize = paginationOptions.pageSize || totalItems
      const totalPages = Math.ceil(totalItems / pageSize)
      const currentPage = paginationOptions.page || 1
      
      // Add pagination metadata to the result
      result._pagination = {
        page: currentPage,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      }
    }
  }
  
  return result
}

/**
 * Searches for matching types and fields in a GraphQL schema
 * @param schema The GraphQL schema to search
 * @param keyword The keyword to search for
 * @param typeDetails Optional map of type details for deeper searching
 * @returns Matching types and fields
 */
async function searchGraphQLSchema(
  schema: SchemaOverviewResponse, 
  keyword: string,
  accountId: string,
  apiToken: string,
  maxDetailsToFetch: number = 10
) {
  const normalizedKeyword = keyword.toLowerCase()
  const results = {
    types: [] as Array<{
      name: string;
      kind: string;
      description: string | null;
      matchReason: string;
    }>,
    fields: [] as Array<{
      typeName: string;
      fieldName: string;
      description: string | null;
      matchReason: string;
    }>,
    enumValues: [] as Array<{
      typeName: string;
      enumValue: string;
      description: string | null;
      matchReason: string;
    }>,
    args: [] as Array<{
      typeName: string;
      fieldName: string;
      argName: string;
      description: string | null;
      matchReason: string;
    }>
  }
  
  // First pass: Search through type names and descriptions
  const matchingTypeNames: string[] = []
  
  for (const type of schema.data.__schema.types || []) {
    // Skip internal types (those starting with __)
    if (type.name?.startsWith('__')) continue
    
    // Check if type name or description matches
    if (type.name?.toLowerCase().includes(normalizedKeyword)) {
      results.types.push({
        ...type,
        matchReason: `Type name contains "${keyword}"`
      })
      matchingTypeNames.push(type.name)
    } else if (type.description?.toLowerCase().includes(normalizedKeyword)) {
      results.types.push({
        ...type,
        matchReason: `Type description contains "${keyword}"`
      })
      matchingTypeNames.push(type.name)
    }
  }
  
  // Second pass: For potentially relevant types, fetch details and search deeper
  // Start with matching types, then add important schema types if we have capacity
  let typesToExamine = [...matchingTypeNames]
  
  // Add root operation types if they're not already included
  const rootTypes = [
    schema.data.__schema.queryType?.name,
    schema.data.__schema.mutationType?.name,
    schema.data.__schema.subscriptionType?.name
  ].filter(Boolean) as string[]
  
  for (const rootType of rootTypes) {
    if (!typesToExamine.includes(rootType)) {
      typesToExamine.push(rootType)
    }
  }
  
  // Add object types that might contain relevant fields
  const objectTypes = schema.data.__schema.types
    .filter(t => (t.kind === 'OBJECT' || t.kind === 'INTERFACE') && !t.name.startsWith('__'))
    .map(t => t.name)
  
  // Combine all potential types to examine, but limit to a reasonable number
  typesToExamine = [...new Set([...typesToExamine, ...objectTypes])]
    .slice(0, maxDetailsToFetch)
  
  // Fetch details for these types and search through their fields
  for (const typeName of typesToExamine) {
    try {
      const typeDetails = await fetchTypeDetails(typeName, accountId, apiToken)
      const type = typeDetails.data.__type
      
      if (!type) continue
      
      // Search through fields
      if (type.fields) {
        for (const field of type.fields) {
          // Check if field name or description matches
          if (field.name.toLowerCase().includes(normalizedKeyword)) {
            results.fields.push({
              typeName: type.name,
              fieldName: field.name,
              description: field.description,
              matchReason: `Field name contains "${keyword}"`
            })
          } else if (field.description?.toLowerCase().includes(normalizedKeyword)) {
            results.fields.push({
              typeName: type.name,
              fieldName: field.name,
              description: field.description,
              matchReason: `Field description contains "${keyword}"`
            })
          }
          
          // Search through field arguments
          if (field.args) {
            for (const arg of field.args) {
              if (arg.name.toLowerCase().includes(normalizedKeyword)) {
                results.args.push({
                  typeName: type.name,
                  fieldName: field.name,
                  argName: arg.name,
                  description: arg.description,
                  matchReason: `Argument name contains "${keyword}"`
                })
              } else if (arg.description?.toLowerCase().includes(normalizedKeyword)) {
                results.args.push({
                  typeName: type.name,
                  fieldName: field.name,
                  argName: arg.name,
                  description: arg.description,
                  matchReason: `Argument description contains "${keyword}"`
                })
              }
            }
          }
        }
      }
      
      // Search through enum values
      if (type.enumValues) {
        for (const enumValue of type.enumValues) {
          if (enumValue.name.toLowerCase().includes(normalizedKeyword)) {
            results.enumValues.push({
              typeName: type.name,
              enumValue: enumValue.name,
              description: enumValue.description,
              matchReason: `Enum value contains "${keyword}"`
            })
          } else if (enumValue.description?.toLowerCase().includes(normalizedKeyword)) {
            results.enumValues.push({
              typeName: type.name,
              enumValue: enumValue.name,
              description: enumValue.description,
              matchReason: `Enum value description contains "${keyword}"`
            })
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching details for type ${typeName}:`, error)
    }
  }
  
  return results
}

/**
 * Registers GraphQL tools with the MCP server
 * @param agent The MCP agent instance
 */
export function registerGraphQLTools(agent: GraphQLMCP) {
  // Tool to search the GraphQL schema for types, fields, and enum values matching a keyword
  agent.server.tool(
    'graphql_schema_search',
    'Search the Cloudflare GraphQL API schema for types, fields, and enum values matching a keyword',
    {
      keyword: z.string().describe('The keyword to search for in the schema'),
      maxDetailsToFetch: z.number().min(1).max(50).default(10).describe('Maximum number of types to fetch details for'),
      includeInternalTypes: z.boolean().default(false).describe('Whether to include internal types (those starting with __) in the search results'),
    },
    async (params) => {
      const { keyword, maxDetailsToFetch = 10, includeInternalTypes = false } = params
      const accountId = await agent.getActiveAccountId()
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
        // First fetch the schema overview
        const schemaOverview = await fetchSchemaOverview(accountId, agent.props.accessToken)
        
        // Search the schema for the keyword
        const searchResults = await searchGraphQLSchema(
          schemaOverview, 
          keyword, 
          accountId, 
          agent.props.accessToken,
          maxDetailsToFetch
        )
        
        // Filter out internal types if requested
        if (!includeInternalTypes) {
          searchResults.types = searchResults.types.filter(t => !t.name.startsWith('__'))
          searchResults.fields = searchResults.fields.filter(f => !f.typeName.startsWith('__'))
          searchResults.enumValues = searchResults.enumValues.filter(e => !e.typeName.startsWith('__'))
          searchResults.args = searchResults.args.filter(a => !a.typeName.startsWith('__'))
        }
        
        // Add summary information
        const results = {
          keyword,
          summary: {
            totalMatches: searchResults.types.length + searchResults.fields.length + 
                         searchResults.enumValues.length + searchResults.args.length,
            typeMatches: searchResults.types.length,
            fieldMatches: searchResults.fields.length,
            enumValueMatches: searchResults.enumValues.length,
            argumentMatches: searchResults.args.length,
          },
          results: searchResults
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Error searching GraphQL schema: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
        }
      }
    }
  )
  
  // Tool to fetch the GraphQL schema overview (high-level structure)
  agent.server.tool(
    'graphql_schema_overview',
    'Fetch the high-level overview of the Cloudflare GraphQL API schema',
    {
      pageSize: z.number().min(10).max(1000).default(100).describe('Number of types to return per page'),
      page: z.number().min(1).default(1).describe('Page number to fetch'),
    },
    async (params) => {
      const { pageSize = 100, page = 1 } = params
      const accountId = await agent.getActiveAccountId()
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
        
        // Apply pagination to the types array
        const allTypes = schemaOverview.data.__schema.types || []
        const totalTypes = allTypes.length
        const totalPages = Math.ceil(totalTypes / pageSize)
        
        // Calculate start and end indices for the current page
        const startIndex = (page - 1) * pageSize
        const endIndex = Math.min(startIndex + pageSize, totalTypes)
        
        // Create a paginated version of the schema
        const paginatedSchema = {
          data: {
            __schema: {
              queryType: schemaOverview.data.__schema.queryType,
              mutationType: schemaOverview.data.__schema.mutationType,
              subscriptionType: schemaOverview.data.__schema.subscriptionType,
              types: allTypes.slice(startIndex, endIndex),
            }
          },
          pagination: {
            page,
            pageSize,
            totalTypes,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          }
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(paginatedSchema),
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
      fieldsPageSize: z.number().min(5).max(500).default(50).describe('Number of fields to return per page'),
      fieldsPage: z.number().min(1).default(1).describe('Page number for fields to fetch'),
      enumValuesPageSize: z.number().min(5).max(500).default(50).describe('Number of enum values to return per page'),
      enumValuesPage: z.number().min(1).default(1).describe('Page number for enum values to fetch'),
    },
    async (params) => {
      const { 
        typeName, 
        fieldsPageSize = 50, 
        fieldsPage = 1,
        enumValuesPageSize = 50,
        enumValuesPage = 1
      } = params
      
      const accountId = await agent.getActiveAccountId()
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
        const typeDetails = await fetchTypeDetails(typeName, accountId, agent.props.accessToken)
        
        // Apply pagination to fields if they exist
        const allFields = typeDetails.data.__type.fields || []
        const totalFields = allFields.length
        const totalFieldsPages = Math.ceil(totalFields / fieldsPageSize)
        
        // Calculate start and end indices for the fields page
        const fieldsStartIndex = (fieldsPage - 1) * fieldsPageSize
        const fieldsEndIndex = Math.min(fieldsStartIndex + fieldsPageSize, totalFields)
        
        // Apply pagination to enum values if they exist
        const allEnumValues = typeDetails.data.__type.enumValues || []
        const totalEnumValues = allEnumValues.length
        const totalEnumValuesPages = Math.ceil(totalEnumValues / enumValuesPageSize)
        
        // Calculate start and end indices for the enum values page
        const enumValuesStartIndex = (enumValuesPage - 1) * enumValuesPageSize
        const enumValuesEndIndex = Math.min(enumValuesStartIndex + enumValuesPageSize, totalEnumValues)
        
        // Create a paginated version of the type details
        const paginatedTypeDetails = {
          data: {
            __type: {
              ...typeDetails.data.__type,
              fields: allFields.slice(fieldsStartIndex, fieldsEndIndex),
              enumValues: allEnumValues.slice(enumValuesStartIndex, enumValuesEndIndex),
            }
          },
          pagination: {
            fields: {
              page: fieldsPage,
              pageSize: fieldsPageSize,
              totalFields,
              totalPages: totalFieldsPages,
              hasNextPage: fieldsPage < totalFieldsPages,
              hasPreviousPage: fieldsPage > 1,
            },
            enumValues: {
              page: enumValuesPage,
              pageSize: enumValuesPageSize,
              totalEnumValues,
              totalPages: totalEnumValuesPages,
              hasNextPage: enumValuesPage < totalEnumValuesPages,
              hasPreviousPage: enumValuesPage > 1,
            }
          }
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(paginatedTypeDetails),
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
    {
      typesPageSize: z.number().min(10).max(500).default(100).describe('Number of types to return per page'),
      typesPage: z.number().min(1).default(1).describe('Page number for types to fetch'),
      includeRootTypeDetails: z.boolean().default(true).describe('Whether to include detailed information about root types'),
      maxTypeDetailsToFetch: z.number().min(0).max(10).default(3).describe('Maximum number of important types to fetch details for'),
    },
    async (params) => {
      const { 
        typesPageSize = 100, 
        typesPage = 1,
        includeRootTypeDetails = true,
        maxTypeDetailsToFetch = 3
      } = params
      
      const accountId = await agent.getActiveAccountId()
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
        // First fetch the schema overview
        const schemaOverview = await fetchSchemaOverview(accountId, agent.props.accessToken)
        
        // Apply pagination to the types array
        const allTypes = schemaOverview.data.__schema.types || []
        const totalTypes = allTypes.length
        const totalPages = Math.ceil(totalTypes / typesPageSize)
        
        // Calculate start and end indices for the current page
        const startIndex = (typesPage - 1) * typesPageSize
        const endIndex = Math.min(startIndex + typesPageSize, totalTypes)
        
        // Get the paginated types
        const paginatedTypes = allTypes.slice(startIndex, endIndex)
        
        // Create the base schema with paginated types
        const schema: {
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
            }
          },
          typeDetails: Record<string, GraphQLType>;
          pagination: {
            types: {
              page: number;
              pageSize: number;
              totalTypes: number;
              totalPages: number;
              hasNextPage: boolean;
              hasPreviousPage: boolean;
            }
          }
        } = {
          data: {
            __schema: {
              queryType: schemaOverview.data.__schema.queryType,
              mutationType: schemaOverview.data.__schema.mutationType,
              subscriptionType: schemaOverview.data.__schema.subscriptionType,
              types: paginatedTypes,
            }
          },
          typeDetails: {} as Record<string, GraphQLType>,
          pagination: {
            types: {
              page: typesPage,
              pageSize: typesPageSize,
              totalTypes,
              totalPages,
              hasNextPage: typesPage < totalPages,
              hasPreviousPage: typesPage > 1,
            }
          }
        }
        
        // If requested, fetch details for root types
        if (includeRootTypeDetails) {
          // Identify important root types
          const rootTypes = [
            schemaOverview.data.__schema.queryType?.name,
            ...(schemaOverview.data.__schema.mutationType?.name ? [schemaOverview.data.__schema.mutationType.name] : [])
          ].filter(Boolean) as string[]
          
          // Limit the number of types to fetch details for
          const typesToFetch = rootTypes.slice(0, maxTypeDetailsToFetch)
          
          // Fetch details for each type
          for (const typeName of typesToFetch) {
            try {
              const typeDetails = await fetchTypeDetails(typeName, accountId, agent.props.accessToken)
              if (typeDetails.data.__type) {
                schema.typeDetails[typeName] = typeDetails.data.__type
              }
            } catch (error) {
              console.error(`Error fetching details for type ${typeName}:`, error)
            }
          }
        }
        
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
    'Execute a GraphQL query against the Cloudflare API with pagination support',
    {
      query: z.string().describe('The GraphQL query to execute'),
      variables: z.record(z.any()).optional().describe('Variables for the query'),
      paginationPath: z.string().optional().describe('JSON path to the array that needs pagination (e.g., "data.viewer.zones")'),
      pageSize: z.number().min(1).max(1000).optional().describe('Number of items per page'),
      page: z.number().min(1).optional().describe('Page number to fetch'),
    },
    async (params) => {
      const accountId = await agent.getActiveAccountId()
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
        const { query, variables = {}, paginationPath, pageSize, page } = params
        
        // Setup pagination options if provided
        const paginationOptions = paginationPath ? {
          paginationPath,
          pageSize,
          page
        } : undefined
        
        const result = await executeGraphQLQuery(
          query, 
          variables, 
          accountId, 
          agent.props.accessToken,
          paginationOptions
        )
        
        // If the response is too large, suggest using pagination
        const resultString = JSON.stringify(result)
        if (resultString.length > 900000) { // Close to the 1MB limit
          return {
            content: [
              {
                type: 'text',
                text: 'The query result is very large and approaching the 1MB response limit. Please use pagination by providing paginationPath, pageSize, and page parameters.'
              }
            ]
          }
        }
        
        return {
          content: [
            {
              type: 'text',
              text: resultString,
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
