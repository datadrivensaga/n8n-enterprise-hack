import { Container } from '@n8n/di';
import type { Request, Response, NextFunction } from 'express';

import { tenantContext } from './context';

import { AUTH_COOKIE_NAME } from '@/constants';
import type { User } from '@/databases/entities/user';
import { UserRepository } from '@/databases/repositories/user.repository';
import { JwtService } from '@/services/jwt.service';

// Extend the Request interface to include the user field
declare global {
	namespace Express {
		interface Request {
			user?: User;
		}
	}
}

/**
 * Middleware to extract tenant ID and run logic within tenant context.
 * Extracts tenant ID from URLs in the format /:tenantId/... and configures the context.
 * Allows login from any tenant and then uses the authenticated user's tenantId.
 */
export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
	console.log('[TenantMiddleware] Executing for URL:', req.originalUrl);
	console.log('[TenantMiddleware] req.user:', JSON.stringify(req.user, null, 2));

	const tenantIdFromUser = req.user?.tenantId;
	console.log('[TenantMiddleware] Tenant ID from req.user:', tenantIdFromUser);

	let tenantIdFromCookie: string | undefined;

	if (!tenantIdFromUser) {
		try {
			const token = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
			console.log('[TenantMiddleware] Auth token from cookie:', token ? 'found' : 'not found');
			if (token) {
				const jwtService = Container.get(JwtService);
				const payload = jwtService.decode(token) as { id?: string } | null;
				console.log('[TenantMiddleware] Decoded JWT payload from cookie:', JSON.stringify(payload));
				if (payload?.id) {
					const userRepository = Container.get(UserRepository);
					const user = await userRepository.findOne({
						where: { id: payload.id },
						select: ['id', 'tenantId'],
					});
					console.log(
						"[TenantMiddleware] User (id, tenantId) fetched from DB using cookie's userId:",
						JSON.stringify(user),
					);
					if (user?.tenantId) {
						tenantIdFromCookie = user.tenantId;
						console.log(
							"[TenantMiddleware] Tenant ID from cookie's JWT (user in DB):",
							tenantIdFromCookie,
						);
					}
				}
			}
		} catch (error) {
			console.error(
				'[TenantMiddleware] Error processing JWT from cookie:',
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	const defaultTenantId = process.env.N8N_DEFAULT_TENANT_ID ?? '1';
	console.log('[TenantMiddleware] defaultTenantId:', defaultTenantId);

	// Usa req.originalUrl para a decisão inicial do tenantId da URL e se é API call,
	// pois req.url pode ser modificado por middlewares anteriores.
	const tenantIdFromUrlFromOriginal = req.originalUrl.match(/^\/(\d+)/)?.[1];
	console.log(
		'[TenantMiddleware] tenantIdFromUrl (from req.originalUrl "' + req.originalUrl + '"):',
		tenantIdFromUrlFromOriginal,
	);

	let finalTenantId: string;
	const tenantIdFromUrlExplicitMatch = req.originalUrl.match(/^\/(\d+)/);
	const isApiCall =
		req.originalUrl.startsWith('/rest/') ||
		req.originalUrl.startsWith('/api/') ||
		(tenantIdFromUrlExplicitMatch &&
			(req.originalUrl.startsWith(`${tenantIdFromUrlExplicitMatch[0]}/rest/`) ||
				req.originalUrl.startsWith(`${tenantIdFromUrlExplicitMatch[0]}/api/`)));

	console.log('[TenantMiddleware] Is API call:', isApiCall);

	if (isApiCall) {
		// Para chamadas de API, priorizar o tenant do usuário autenticado
		if (tenantIdFromUser) {
			finalTenantId = tenantIdFromUser;
			console.log(`[TenantMiddleware] API Call: Using tenantId from req.user: ${finalTenantId}`);
			if (tenantIdFromUrlExplicitMatch?.[1] && tenantIdFromUrlExplicitMatch[1] !== finalTenantId) {
				console.warn(
					`[TenantMiddleware] API Call: User tenantId (${finalTenantId}) overrides explicit URL tenantId (${tenantIdFromUrlExplicitMatch[1]}) for context. URL: ${req.originalUrl}`,
				);
			}
		} else if (tenantIdFromCookie) {
			finalTenantId = tenantIdFromCookie;
			console.log(`[TenantMiddleware] API Call: Using tenantId from JWT cookie: ${finalTenantId}`);
			if (tenantIdFromUrlExplicitMatch?.[1] && tenantIdFromUrlExplicitMatch[1] !== finalTenantId) {
				console.warn(
					`[TenantMiddleware] API Call: Cookie tenantId (${finalTenantId}) overrides explicit URL tenantId (${tenantIdFromUrlExplicitMatch[1]}) for context. URL: ${req.originalUrl}`,
				);
			}
		} else if (tenantIdFromUrlExplicitMatch?.[1]) {
			// Se não há usuário autenticado, mas a URL da API tem um tenant explícito
			finalTenantId = tenantIdFromUrlExplicitMatch[1];
			console.log(
				`[TenantMiddleware] API Call: No authenticated user, using tenantId from explicit URL path: ${finalTenantId}`,
			);
		} else {
			// Fallback para defaultTenantId para APIs se nada mais for encontrado (cenário incomum para APIs protegidas)
			finalTenantId = defaultTenantId;
			console.log(
				`[TenantMiddleware] API Call: No authenticated user or explicit URL tenant, using default tenantId: ${finalTenantId}`,
			);
		}
	} else {
		// Lógica existente para navegação de UI e assets (não API)
		// Priorizar tenantId da URL explícita para navegação, depois usuário, depois cookie, depois default.
		if (tenantIdFromUrlExplicitMatch?.[1]) {
			finalTenantId = tenantIdFromUrlExplicitMatch[1];
			console.log(
				`[TenantMiddleware] Non-API Call: Prioritizing tenantId from explicit URL path: ${finalTenantId}`,
			);
		} else if (tenantIdFromUser) {
			finalTenantId = tenantIdFromUser;
			console.log(
				`[TenantMiddleware] Non-API Call: Using tenantId from req.user: ${finalTenantId}`,
			);
		} else if (tenantIdFromCookie) {
			finalTenantId = tenantIdFromCookie;
			console.log(
				`[TenantMiddleware] Non-API Call: Using tenantId from JWT cookie: ${finalTenantId}`,
			);
		} else {
			finalTenantId = defaultTenantId;
			console.log(`[TenantMiddleware] Non-API Call: Using default tenantId: ${finalTenantId}`);
		}
	}

	console.log('[TenantMiddleware] Final tenantId determined:', finalTenantId);

	// A reescrita da URL deve usar req.url, que é a URL que os roteadores internos verão.
	// Precisamos garantir que qualquer prefixo numérico /tenantId/ seja removido de req.url
	// para que o roteamento interno do Express funcione corretamente.
	const currentUrlTenantIdMatch = req.url.match(/^\/(\d+)/);
	if (currentUrlTenantIdMatch) {
		const oldUrl = req.url;
		req.url = req.url.replace(/^\/\d+/, '') || '/';
		console.log(
			`[TenantMiddleware] Rewrote URL from ${oldUrl} to ${req.url} (original prefix was ${currentUrlTenantIdMatch[0]}, finalTenantId is ${finalTenantId})`,
		);
	}

	console.log(`[TenantMiddleware] Running tenantContext with tenantId: ${finalTenantId}`);
	tenantContext.run({ tenantId: finalTenantId }, () => next());
}
