import OAuthProvider from '@cloudflare/workers-oauth-provider'
import { McpAgent } from 'agents/mcp'
import { env } from 'cloudflare:workers'

import {
	createAuthHandlers,
	handleTokenExchangeCallback,
} from '@repo/mcp-common/src/cloudflare-oauth-handler'
import { CloudflareMCPServer } from '@repo/mcp-common/src/server'
import { registerAccountTools } from '@repo/mcp-common/src/tools/account'

import { MetricsTracker } from '../../../packages/mcp-observability/src'
import { registerIntegrationsTools } from './tools/integrations'

import type { AccountSchema, UserSchema } from '@repo/mcp-common/src/cloudflare-oauth-handler'
import type { CloudflareMcpAgent } from '@repo/mcp-common/src/types/cloudflare-mcp-agent'

const metrics = new MetricsTracker(env.MCP_METRICS, {
	name: env.MCP_SERVER_NAME,
	version: env.MCP_SERVER_VERSION,
})

export type Props = {
	accessToken: string
	user: UserSchema['result']
	accounts: AccountSchema['result']
}

export type State = { activeAccountId: string | null }
export class CASBMCP extends McpAgent<Env, State, Props> {
	_server: CloudflareMCPServer | undefined
	set server(server: CloudflareMCPServer) {
		this._server = server
	}

	get server(): CloudflareMCPServer {
		if (!this._server) {
			throw new Error('Tried to access server before it was initialized')
		}

		return this._server
	}

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
	}

	async init() {
		this.server = new CloudflareMCPServer(this.props.user.id, this.env.MCP_METRICS, {
			name: this.env.MCP_SERVER_NAME,
			version: this.env.MCP_SERVER_VERSION,
		})

		registerAccountTools(this)
		registerIntegrationsTools(this)
	}

	getActiveAccountId() {
		try {
			return this.state.activeAccountId ?? null
		} catch (e) {
			console.error('getActiveAccountId failured: ', e)
			return null
		}
	}

	setActiveAccountId(accountId: string) {
		try {
			this.setState({
				...this.state,
				activeAccountId: accountId,
			})
		} catch (e) {
			return null
		}
	}
}
const CloudflareOneCasbScopes = {
	'account:read': 'See your account info such as account details, analytics, and memberships.',
	'user:read': 'See your user info such as name, email address, and account memberships.',
	'teams:read': 'See Cloudflare One Resources',
	offline_access: 'Grants refresh tokens for long-lived access.',
} as const

export default new OAuthProvider({
	apiRoute: '/sse',
	// @ts-ignore
	apiHandler: CASBMCP.mount('/sse'),
	// @ts-ignore
	defaultHandler: createAuthHandlers({ scopes: CloudflareOneCasbScopes, metrics }),
	authorizeEndpoint: '/oauth/authorize',
	tokenEndpoint: '/token',
	tokenExchangeCallback: (options) =>
		handleTokenExchangeCallback(options, env.CLOUDFLARE_CLIENT_ID, env.CLOUDFLARE_CLIENT_SECRET),
	// Cloudflare access token TTL
	accessTokenTTL: 3600,
	clientRegistrationEndpoint: '/register',
})
