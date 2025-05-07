import { Service, Container } from '@n8n/di';
import type { EntitySubscriberInterface, InsertEvent } from '@n8n/typeorm';
import { EventSubscriber } from '@n8n/typeorm';
import { Logger } from 'n8n-core';

import { Project } from '../entities/project';
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
	 * Define o tenantId corretamente com base no workflow, projeto ou no contexto atual.
	 */
	beforeInsert(event: InsertEvent<SharedWorkflow>): void {
		// Obtém o contexto atual do tenant ou o padrão '1'
		const currentTenantId = tenantContext.getStore()?.tenantId ?? '1';

		// Primeiro vamos determinar qual tenantId devemos usar
		// Prioridade: 1. Workflow, 2. Projeto, 3. Contexto atual
		let effectiveTenantId = currentTenantId;

		// Se o workflow já tem um tenantId, usamos ele como efetivo
		if (event.entity.workflow instanceof WorkflowEntity && event.entity.workflow.tenantId) {
			effectiveTenantId = event.entity.workflow.tenantId;
			this.logger.debug(
				`[beforeInsert] Usando tenantId=${effectiveTenantId} do Workflow para SharedWorkflow`,
			);
		}
		// Se não temos tenantId do workflow mas temos do projeto, usamos o do projeto
		else if (event.entity.project instanceof Project && event.entity.project.tenantId) {
			effectiveTenantId = event.entity.project.tenantId;
			this.logger.debug(
				`[beforeInsert] Usando tenantId=${effectiveTenantId} do Projeto para SharedWorkflow`,
			);
		}

		// Agora que determinamos o tenantId efetivo, vamos garantir que ele seja propagado
		// para todas as entidades envolvidas

		// Define o tenantId do próprio SharedWorkflow
		event.entity.tenantId = effectiveTenantId;
		this.logger.debug(
			`[beforeInsert] Definindo tenantId=${effectiveTenantId} para o SharedWorkflow`,
		);

		// Atualiza o tenantId do workflow se necessário
		if (event.entity.workflow instanceof WorkflowEntity) {
			if (event.entity.workflow.tenantId !== effectiveTenantId) {
				event.entity.workflow.tenantId = effectiveTenantId;
				this.logger.debug(
					`[beforeInsert] Atualizando tenantId=${effectiveTenantId} para o Workflow do SharedWorkflow`,
				);
			}
		}

		// Atualiza o tenantId do projeto se necessário
		if (event.entity.project instanceof Project) {
			if (event.entity.project.tenantId !== effectiveTenantId) {
				event.entity.project.tenantId = effectiveTenantId;
				this.logger.debug(
					`[beforeInsert] Atualizando tenantId=${effectiveTenantId} para o Projeto do SharedWorkflow`,
				);
			}
		}

		// Log final para debug com todas as informações
		this.logger.debug(
			'[beforeInsert] SharedWorkflow criado. ' +
				'ProjectId=' +
				event.entity.projectId +
				', ' +
				'WorkflowId=' +
				event.entity.workflowId +
				', ' +
				'TenantId=' +
				effectiveTenantId,
		);
	}
}
