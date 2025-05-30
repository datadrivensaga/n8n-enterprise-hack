import { Service } from '@n8n/di';
import type { Scope } from '@n8n/permissions';
import { DataSource, Repository, In, Not } from '@n8n/typeorm';
import type { EntityManager, FindManyOptions, FindOptionsWhere } from '@n8n/typeorm';

import { RoleService } from '@/services/role.service';
import { tenantContext } from '@/multitenancy/context';

import type { Project } from '../entities/project';
import { SharedWorkflow, type WorkflowSharingRole } from '../entities/shared-workflow';
import { type User } from '../entities/user';

@Service()
export class SharedWorkflowRepository extends Repository<SharedWorkflow> {
	constructor(
		dataSource: DataSource,
		private roleService: RoleService,
	) {
		super(SharedWorkflow, dataSource.manager);
	}

	async getSharedWorkflowIds(workflowIds: string[]) {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		const sharedWorkflows = await this.find({
			select: ['workflowId'],
			where: {
				workflowId: In(workflowIds),
				project: { tenantId },
			},
			relations: { project: true },
		});
		return sharedWorkflows.map((sharing) => sharing.workflowId);
	}

	async findByWorkflowIds(workflowIds: string[]) {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		return await this.find({
			where: {
				role: 'workflow:owner',
				workflowId: In(workflowIds),
				project: { tenantId },
			},
			relations: { project: { projectRelations: { user: true } } },
		});
	}

	async findSharingRole(
		userId: string,
		workflowId: string,
	): Promise<WorkflowSharingRole | undefined> {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		const sharing = await this.findOne({
			// NOTE: We have to select everything that is used in the `where` clause. Otherwise typeorm will create an invalid query and we get this error:
			//       QueryFailedError: SQLITE_ERROR: no such column: distinctAlias.SharedWorkflow_...
			select: {
				role: true,
				workflowId: true,
				projectId: true,
			},
			where: {
				workflowId,
				project: { tenantId, projectRelations: { role: 'project:personalOwner', userId } },
			},
		});

		return sharing?.role;
	}

	async makeOwnerOfAllWorkflows(project: Project) {
		return await this.update(
			{
				projectId: Not(project.id),
				role: 'workflow:owner',
			},
			{ project },
		);
	}

	async makeOwner(workflowIds: string[], projectId: string, trx?: EntityManager) {
		trx = trx ?? this.manager;

		return await trx.upsert(
			SharedWorkflow,
			workflowIds.map(
				(workflowId) =>
					({
						workflowId,
						projectId,
						role: 'workflow:owner',
					}) as const,
			),

			['projectId', 'workflowId'],
		);
	}

	async findWithFields(
		workflowIds: string[],
		{ select }: Pick<FindManyOptions<SharedWorkflow>, 'select'>,
	) {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		return await this.find({
			where: {
				workflowId: In(workflowIds),
				project: { tenantId },
			},
			select,
		});
	}

	async deleteByIds(sharedWorkflowIds: string[], projectId: string, trx?: EntityManager) {
		trx = trx ?? this.manager;

		return await trx.delete(SharedWorkflow, {
			projectId,
			workflowId: In(sharedWorkflowIds),
		});
	}

	async findWorkflowForUser(
		workflowId: string,
		user: User,
		scopes: Scope[],
		{ includeTags = false, includeParentFolder = false, em = this.manager } = {},
	) {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		let where: FindOptionsWhere<SharedWorkflow> = { workflowId, project: { tenantId } };

		if (!user.hasGlobalScope(scopes, { mode: 'allOf' })) {
			const projectRoles = this.roleService.rolesWithScope('project', scopes);
			const workflowRoles = this.roleService.rolesWithScope('workflow', scopes);

			where = {
				...where,
				role: In(workflowRoles),
				project: { tenantId, projectRelations: { role: In(projectRoles), userId: user.id } },
			};
		}

		const sharedWorkflow = await em.findOne(SharedWorkflow, {
			where,
			relations: {
				workflow: {
					shared: { project: { projectRelations: { user: true } } },
					tags: includeTags,
					parentFolder: includeParentFolder,
				},
			},
		});

		if (!sharedWorkflow) {
			return null;
		}

		return sharedWorkflow.workflow;
	}

	async findAllWorkflowsForUser(user: User, scopes: Scope[]) {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		let where: FindOptionsWhere<SharedWorkflow> = { project: { tenantId } };

		if (!user.hasGlobalScope(scopes, { mode: 'allOf' })) {
			const projectRoles = this.roleService.rolesWithScope('project', scopes);
			const workflowRoles = this.roleService.rolesWithScope('workflow', scopes);

			where = {
				...where,
				role: In(workflowRoles),
				project: { tenantId, projectRelations: { role: In(projectRoles), userId: user.id } },
			};
		}

		const sharedWorkflows = await this.find({
			where,
			relations: {
				workflow: {
					shared: { project: { projectRelations: { user: true } } },
				},
			},
		});

		return sharedWorkflows.map((sw) => ({ ...sw.workflow, projectId: sw.projectId }));
	}

	/**
	 * Find the IDs of all the projects where a workflow is accessible.
	 */
	async findProjectIds(workflowId: string) {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		const rows = await this.find({
			where: { workflowId, project: { tenantId } },
			relations: { project: true },
			select: ['projectId'],
		});

		const projectIds = rows.reduce<string[]>((acc, row) => {
			if (row.projectId) acc.push(row.projectId);
			return acc;
		}, []);

		return [...new Set(projectIds)];
	}

	async getWorkflowOwningProject(workflowId: string) {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		return (
			await this.findOne({
				where: { workflowId, role: 'workflow:owner', project: { tenantId } },
				relations: { project: true },
			})
		)?.project;
	}

	async getRelationsByWorkflowIdsAndProjectIds(workflowIds: string[], projectIds: string[]) {
		return await this.find({
			where: {
				workflowId: In(workflowIds),
				projectId: In(projectIds),
			},
		});
	}

	async getAllRelationsForWorkflows(workflowIds: string[]) {
		return await this.find({
			where: {
				workflowId: In(workflowIds),
			},
			relations: ['project'],
		});
	}
}
