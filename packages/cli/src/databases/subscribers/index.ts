import { ExecutionTenantSubscriber } from './execution-tenant-subscriber';
import { ProjectTenantSubscriber } from './project-tenant-subscriber';
import { SharedWorkflowTenantSubscriber } from './shared-workflow-tenant-subscriber';
import { UserSubscriber } from './user-subscriber';
import { UserTenantSubscriber } from './user-tenant-subscriber';
import { WorkflowTenantSubscriber } from './workflow-tenant-subscriber';

export const subscribers = {
	ExecutionTenantSubscriber,
	ProjectTenantSubscriber,
	SharedWorkflowTenantSubscriber,
	UserSubscriber,
	UserTenantSubscriber,
	WorkflowTenantSubscriber,
};
