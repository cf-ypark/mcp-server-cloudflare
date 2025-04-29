import type { z } from 'zod'

export type ToolHandler<T extends Record<string, any>> = (
	params: T & { accountId: string; apiToken: string }
) => Promise<any>

export interface ToolDefinition<T extends Record<string, any>> {
	name: string
	description: string
	params: Record<string, z.ZodType>
	handler: ToolHandler<T>
}
