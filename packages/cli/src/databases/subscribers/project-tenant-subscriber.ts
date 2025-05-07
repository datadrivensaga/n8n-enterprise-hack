import { EventSubscriber, EntitySubscriberInterface, InsertEvent } from '@n8n/typeorm';
import { Logger } from 'n8n-core';
import { Container } from '@n8n/di';

import { tenantContext } from '@/multitenancy/context';
import { Project } from '../entities/project';

@EventSubscriber()
export class ProjectTenantSubscriber implements EntitySubscriberInterface<Project> {
	private get logger() {
		return Container.get(Logger);
	}

	listenTo() {
		return Project;
	}

	beforeInsert(event: InsertEvent<Project>) {
		// Se não veio tenantId, tenta obter do contexto atual
		if (!event.entity.tenantId) {
			const currentTenantId = tenantContext.getStore()?.tenantId ?? '1';
			event.entity.tenantId = currentTenantId;

			this.logger.debug(
				`[ProjectTenantSubscriber.beforeInsert] Setting tenantId=${currentTenantId} for Project entity`,
			);
		}
	}
}
