import { Service } from '@n8n/di';
import type { GlobalRole } from '@n8n/permissions';
import type { DeepPartial, EntityManager, FindManyOptions } from '@n8n/typeorm';
import { DataSource, In, IsNull, Not, Repository } from '@n8n/typeorm';
import { tenantContext } from '@/multitenancy/context';

import type { ListQuery } from '@/requests';

import { Project } from '../entities/project';
import { ProjectRelation } from '../entities/project-relation';
import { User } from '../entities/user';

@Service()
export class UserRepository extends Repository<User> {
	constructor(dataSource: DataSource) {
		super(User, dataSource.manager);
	}

	async findManyByIds(userIds: string[]) {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		return await this.find({
			where: { id: In(userIds), tenantId },
		});
	}

	/**
	 * @deprecated Use `UserRepository.save` instead if you can.
	 *
	 * We need to use `save` so that that the subscriber in
	 * packages/cli/src/databases/entities/Project.ts receives the full user.
	 * With `update` it would only receive the updated fields, e.g. the `id`
	 * would be missing. test('does not use `Repository.update`, but
	 * `Repository.save` instead'.
	 */
	async update(...args: Parameters<Repository<User>['update']>) {
		return await super.update(...args);
	}

	async deleteAllExcept(user: User) {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		await this.delete({ id: Not(user.id), tenantId });
	}

	async getByIds(transaction: EntityManager, ids: string[]) {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		return await transaction.find(User, { where: { id: In(ids), tenantId } });
	}

	async findManyByEmail(emails: string[]) {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		return await this.find({
			where: { email: In(emails), tenantId },
			select: ['email', 'password', 'id'],
		});
	}

	async deleteMany(userIds: string[]) {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		return await this.delete({ id: In(userIds), tenantId });
	}

	async findNonShellUser(email: string) {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		return await this.findOne({
			where: { email, password: Not(IsNull()), tenantId },
			relations: ['authIdentities'],
		});
	}

	/** Counts the number of users in each role, e.g. `{ admin: 2, member: 6, owner: 1 }` */
	async countUsersByRole() {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		const qb = this.createQueryBuilder()
			.select(['role', 'COUNT(role) as count'])
			.where('tenantId = :tenantId', { tenantId })
			.groupBy('role');
		const rows = (await qb.execute()) as Array<{ role: GlobalRole; count: string }>;
		return rows.reduce(
			(acc, row) => {
				acc[row.role] = parseInt(row.count, 10);
				return acc;
			},
			{} as Record<GlobalRole, number>,
		);
	}

	async toFindManyOptions(listQueryOptions?: ListQuery.Options) {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		const findManyOptions: FindManyOptions<User> = { where: { tenantId } };

		if (!listQueryOptions) {
			findManyOptions.relations = ['authIdentities'];
			return findManyOptions;
		}

		const { filter, select, take, skip } = listQueryOptions;

		if (select) findManyOptions.select = select;
		if (take) findManyOptions.take = take;
		if (skip) findManyOptions.skip = skip;

		if (take && !select) {
			findManyOptions.relations = ['authIdentities'];
		}

		if (take && select && !select?.id) {
			findManyOptions.select = { ...findManyOptions.select, id: true }; // pagination requires id
		}

		if (filter) {
			const { isOwner, ...otherFilters } = filter;

			findManyOptions.where = { ...otherFilters, tenantId };

			if (isOwner !== undefined) {
				findManyOptions.where.role = isOwner ? 'global:owner' : Not('global:owner');
			}
		}

		return findManyOptions;
	}

	/**
	 * Get emails of users who have completed setup, by user IDs.
	 */
	async getEmailsByIds(userIds: string[]) {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		return await this.find({
			select: ['email'],
			where: { id: In(userIds), password: Not(IsNull()), tenantId },
		});
	}

	async createUserWithProject(
		user: DeepPartial<User>,
		transactionManager?: EntityManager,
	): Promise<{ user: User; project: Project }> {
		const createInner = async (entityManager: EntityManager) => {
			// Definir explicitamente o tenantId como '1' para garantir que seja preenchido
			const tenantId = '1';

			// Criar e salvar o usuário com o tenantId
			const newUser = entityManager.create(User, { ...user, tenantId });
			const savedUser = await entityManager.save<User>(newUser);

			// Criar e salvar o projeto pessoal com o mesmo tenantId
			const savedProject = await entityManager.save<Project>(
				entityManager.create(Project, {
					type: 'personal',
					name: savedUser.createPersonalProjectName(),
					tenantId,
				}),
			);

			// Criar a relação entre o usuário e o projeto
			await entityManager.save<ProjectRelation>(
				entityManager.create(ProjectRelation, {
					projectId: savedProject.id,
					userId: savedUser.id,
					role: 'project:personalOwner',
				}),
			);

			return { user: savedUser, project: savedProject };
		};
		if (transactionManager) {
			return await createInner(transactionManager);
		}
		// TODO: use a transactions
		// This is blocked by TypeORM having concurrency issues with transactions
		return await createInner(this.manager);
	}

	/**
	 * Find the user that owns the personal project that owns the workflow.
	 *
	 * Returns null if the workflow does not exist or is owned by a team project.
	 */
	async findPersonalOwnerForWorkflow(workflowId: string): Promise<User | null> {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		return await this.findOne({
			where: {
				tenantId,
				projectRelations: {
					role: 'project:personalOwner',
					project: { sharedWorkflows: { workflowId, role: 'workflow:owner' } },
				},
			},
		});
	}

	/**
	 * Find the user that owns the personal project.
	 *
	 * Returns null if the project does not exist or is not a personal project.
	 */
	async findPersonalOwnerForProject(projectId: string): Promise<User | null> {
		const tenantId = tenantContext.getStore()?.tenantId ?? '';
		return await this.findOne({
			where: { tenantId, projectRelations: { role: 'project:personalOwner', projectId } },
		});
	}
}
