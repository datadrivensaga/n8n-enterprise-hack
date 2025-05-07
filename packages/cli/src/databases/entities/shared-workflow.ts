import { Column, Entity, Index, ManyToOne, PrimaryColumn } from '@n8n/typeorm';

import { WithTimestamps } from './abstract-entity';
import { Project } from './project';
import { WorkflowEntity } from './workflow-entity';

export type WorkflowSharingRole = 'workflow:owner' | 'workflow:editor';

@Entity()
export class SharedWorkflow extends WithTimestamps {
	@Column()
	role: WorkflowSharingRole;

	@ManyToOne('WorkflowEntity', 'shared')
	workflow: WorkflowEntity;

	@PrimaryColumn()
	workflowId: string;

	@ManyToOne('Project', 'sharedWorkflows')
	project: Project;

	@PrimaryColumn()
	projectId: string;

	@Index()
	@Column({ length: 36 })
	tenantId: string;
}
