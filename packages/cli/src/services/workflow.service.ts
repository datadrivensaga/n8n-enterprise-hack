import { Service } from '@n8n/di';
import type { FindManyOptions } from '@n8n/typeorm';
import type { User } from '@/databases/entities/user';
import { WorkflowEntity as Workflow } from '@/databases/entities/workflow-entity';
import { WorkflowRepository } from '@/databases/repositories/workflow.repository';
import { SharedWorkflowRepository } from '@/databases/repositories/shared-workflow.repository';
import { In } from '@n8n/typeorm';
import { ProjectService } from '@/services/project.service.ee';

@Service()
export class WorkflowService {
	constructor(
		private readonly workflowRepository: WorkflowRepository,
		private readonly sharedWorkflowRepository: SharedWorkflowRepository,
		private readonly projectService: ProjectService,
	) {}

	/**
	 * Lista todos os workflows que o usuário logado pode acessar,
	 * via tabela de compartilhamento (shared_workflow) e tenant do projeto.
	 */
	async getWorkflowsForUser(user: User, options?: FindManyOptions<Workflow>): Promise<Workflow[]> {
		// Busca IDs de projetos que o usuário possui (pessoal ou equipe)
		const personalProject = await this.projectService.getPersonalProject(user);
		const projectIds = [personalProject.id];
		// Busca workflows compartilhados com esses projetos e usuário
		const shared = await this.sharedWorkflowRepository.find({
			where: { projectId: personalProject.id, role: 'workflow:owner' },
		});
		if (shared.length) {
			projectIds.push(...shared.map((s) => s.projectId));
		}
		// Consulta workflows
		return this.workflowRepository.find({
			where: { id: In(shared.map((s) => s.workflowId)) },
			skip: options?.skip,
			take: options?.take,
			order: options?.order,
		});
	}

	/**
	 * Busca um único workflow, garantindo acesso via shared_workflow.
	 */
	async getWorkflowForUser(user: User, workflowId: string): Promise<Workflow | null> {
		const personalProject = await this.projectService.getPersonalProject(user);
		const relation = await this.sharedWorkflowRepository.findOne({
			where: { workflowId, projectId: personalProject.id, role: 'workflow:owner' },
		});
		if (!relation) return null;
		return this.workflowRepository.findOne({ where: { id: workflowId } });
	}

	/**
	 * Salva um workflow e compartilha com o projeto pessoal do usuário.
	 */
	async saveWorkflowForUser(user: User, workflow: Workflow): Promise<Workflow> {
		// Salva ou atualiza workflow
		const saved = await this.workflowRepository.save(workflow);
		// Associa ao projeto pessoal
		const project = await this.projectService.getPersonalProject(user);
		await this.sharedWorkflowRepository.save({
			workflowId: saved.id,
			projectId: project.id,
			role: 'workflow:owner',
		});
		return saved;
	}
}
