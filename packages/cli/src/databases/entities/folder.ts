import {
	Column,
	Entity,
	Index,
	JoinColumn,
	JoinTable,
	ManyToMany,
	ManyToOne,
	OneToMany,
} from '@n8n/typeorm';

import { WithTimestampsAndStringId } from './abstract-entity';
import { Project } from './project';
import { TagEntity } from './tag-entity';
import { type WorkflowEntity } from './workflow-entity';

export type FolderWithWorkflowAndSubFolderCount = Folder & {
	workflowCount: boolean;
	subFolderCount: number;
};

@Entity()
export class Folder extends WithTimestampsAndStringId {
	@Column()
	name: string;

	@Index()
	@Column({ length: 36 })
	tenantId: string;

	@Column({ nullable: true })
	parentFolderId: string | null;

	@ManyToOne(() => Folder, { nullable: true, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'parentFolderId' })
	parentFolder: Folder | null;

	@OneToMany(
		() => Folder,
		(folder) => folder.parentFolder,
	)
	subFolders: Folder[];

	@ManyToOne(() => Project)
	@JoinColumn({ name: 'projectId' })
	homeProject: Project;

	@OneToMany('WorkflowEntity', 'parentFolder')
	workflows: WorkflowEntity[];

	@ManyToMany(() => TagEntity)
	@JoinTable({
		name: 'folder_tag',
		joinColumn: {
			name: 'folderId',
			referencedColumnName: 'id',
		},
		inverseJoinColumn: {
			name: 'tagId',
			referencedColumnName: 'id',
		},
	})
	tags: TagEntity[];
}
