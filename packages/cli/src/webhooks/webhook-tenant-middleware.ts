import { Service } from '@n8n/di';
import { tenantContext } from '@/multitenancy/context';
import { Logger } from 'n8n-core';
import { Container } from '@n8n/di';
import type { RequestHandler } from 'express';
import type { WebhookRequest } from './webhook.types';

/**
 * Middleware para garantir que o tenantId esteja corretamente configurado para execuções de webhook
 */
@Service()
export class WebhookTenantMiddleware {
	get logger() {
		return Container.get(Logger);
	}

	/**
	 * Middleware que extrai o tenantId do URL do webhook e o configura no contexto atual
	 */
	webhookTenantMiddleware(): RequestHandler {
		return (req: WebhookRequest, _res, next) => {
			try {
				// Extrair o tenantId da URL - assumindo que o padrão é /webhook/{tenantId}/...
				const urlPathParts = req.path.split('/');
				let extractedTenantId: string | undefined;

				// Procurar pelo tenantId no path
				if (urlPathParts.length > 2 && urlPathParts[1] === 'webhook') {
					extractedTenantId = urlPathParts[2];
				}

				// Se o tenantId não foi encontrado no URL, verificar no request headers
				if (!extractedTenantId && req.headers['x-n8n-tenant-id']) {
					extractedTenantId = req.headers['x-n8n-tenant-id'] as string;
				}

				const currentTenantId = tenantContext.getStore()?.tenantId;

				// Se o tenantId foi encontrado e é diferente do contexto atual, atualizá-lo
				if (extractedTenantId && extractedTenantId !== currentTenantId) {
					const oldContext = tenantContext.getStore();
					const newContext = { ...oldContext, tenantId: extractedTenantId };

					// Configurar o novo contexto
					tenantContext.run(newContext, () => {
						this.logger.debug(
							`[WebhookTenantMiddleware] Tenant context atualizado: ${currentTenantId} -> ${extractedTenantId}`,
						);
						next();
					});
				} else {
					// Se não encontrou um tenantId ou se já é o mesmo, continuar normalmente
					this.logger.debug(
						`[WebhookTenantMiddleware] Mantendo tenant context atual: ${currentTenantId ?? '1'}`,
					);
					next();
				}
			} catch (error) {
				// Em caso de erro, apenas log e continuar
				this.logger.warn(
					`[WebhookTenantMiddleware] Erro ao processar tenant: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
				);
				next();
			}
		};
	}
}
