import { Service, Container } from '@n8n/di';
import type { EntitySubscriberInterface, InsertEvent } from '@n8n/typeorm';
import { EventSubscriber } from '@n8n/typeorm';
import { Logger } from 'n8n-core';

import { SharedWorkflow } from '../entities/shared-workflow';
import { WorkflowEntity } from '../entities/workflow-entity';
import { tenantContext } from '@/multitenancy/context';

@Service()
@EventSubscriber()
export class SharedWorkflowTenantSubscriber implements EntitySubscriberInterface<SharedWorkflow> {
	private get logger() {
		return Container.get(Logger);
	}

	listenTo() {
		return SharedWorkflow;
	}

	/**
	 * Executado antes da inserção de um shared workflow no banco de dados.
	 * Define o tenantId corretamente com base no workflow ou no contexto atual.
	 */
	beforeInsert(event: InsertEvent<SharedWorkflow>): void {
		const currentTenantId = tenantContext.getStore()?.tenantId ?? '1';

		// 1. Verificar e definir o tenantId do projeto se estiver faltando
		if (event.entity.project && !event.entity.project.tenantId) {
			event.entity.project.tenantId = currentTenantId;
			this.logger.debug(
				`[beforeInsert] Definindo tenantId=${currentTenantId} para o projeto do SharedWorkflow`,
			);
		}

		// 2. Verificar também se o workflow associado tem o tenantId definido corretamente
		if (event.entity.workflow instanceof WorkflowEntity && !event.entity.workflow.tenantId) {
			event.entity.workflow.tenantId = currentTenantId;
			this.logger.debug(
				`[beforeInsert] Definindo tenantId=${currentTenantId} para o Workflow do SharedWorkflow`,
			);
		}

		// 3. Log final para debug com todas as informações
		this.logger.debug(
			'[beforeInsert] SharedWorkflow criado. ' +
				'ProjectId=' +
				event.entity.projectId +
				', ' +
				'WorkflowId=' +
				event.entity.workflowId +
				', ' +
				'TenantContext=' +
				currentTenantId,
		);
	}
}
