import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router';
import { VIEWS } from '@/constants';
import { useProjectsStore } from '@/stores/projects.store';
import { getResourcePermissions } from '@/permissions';

const MainSidebar = async () => await import('@/components/MainSidebar.vue');
const WorkflowsView = async () => await import('@/views/WorkflowsView.vue');
const CredentialsView = async () => await import('@/views/CredentialsView.vue');
const ProjectSettings = async () => await import('@/views/ProjectSettings.vue');
const ExecutionsView = async () => await import('@/views/ExecutionsView.vue');

const checkProjectAvailability = (to?: RouteLocationNormalized): boolean => {
	if (!to?.params.projectId) {
		return true;
	}
	const project = useProjectsStore().myProjects.find((p) => to?.params.projectId === p.id);
	return !!project;
};

const commonChildRoutes: RouteRecordRaw[] = [
	{
		path: 'workflows',
		components: {
			default: WorkflowsView,
			sidebar: MainSidebar,
		},
		meta: {
			middleware: ['authenticated', 'custom'],
			middlewareOptions: {
				custom: (options) => checkProjectAvailability(options?.to),
			},
		},
	},
	{
		path: 'credentials/:credentialId?',
		props: true,
		components: {
			default: CredentialsView,
			sidebar: MainSidebar,
		},
		meta: {
			middleware: ['authenticated', 'custom'],
			middlewareOptions: {
				custom: (options) => checkProjectAvailability(options?.to),
			},
		},
	},
	{
		path: 'executions',
		components: {
			default: ExecutionsView,
			sidebar: MainSidebar,
		},
		meta: {
			middleware: ['authenticated', 'custom'],
			middlewareOptions: {
				custom: (options) => checkProjectAvailability(options?.to),
			},
		},
	},
	{
		path: 'folders/:folderId?/workflows',
		components: {
			default: WorkflowsView,
			sidebar: MainSidebar,
		},
		meta: {
			middleware: ['authenticated', 'custom'],
			middlewareOptions: {
				custom: (options) => checkProjectAvailability(options?.to),
			},
		},
	},
];

const commonChildRouteExtensions = {
	home: [
		{
			name: VIEWS.WORKFLOWS,
		},
		{
			name: VIEWS.CREDENTIALS,
		},
		{
			name: VIEWS.EXECUTIONS,
		},
		{
			name: VIEWS.FOLDERS,
		},
	],
	projects: [
		{
			name: VIEWS.PROJECTS_WORKFLOWS,
		},
		{
			name: VIEWS.PROJECTS_CREDENTIALS,
		},
		{
			name: VIEWS.PROJECTS_EXECUTIONS,
		},
		{
			name: VIEWS.PROJECTS_FOLDERS,
		},
	],
};

export const projectsRoutes: RouteRecordRaw[] = [
	{
		path: '/:tenantId/projects',
		name: VIEWS.PROJECTS,
		meta: {
			middleware: ['authenticated'],
		},
		redirect: (to) => `/${to.params.tenantId}/home/workflows`,
		children: [
			{
				path: ':projectId',
				meta: {
					middleware: ['authenticated'],
				},
				redirect: (to) => ({
					name: VIEWS.PROJECTS_WORKFLOWS,
					params: { tenantId: to.params.tenantId, projectId: to.params.projectId },
				}),
				children: commonChildRoutes
					.map((route, idx) => ({
						...route,
						name: commonChildRouteExtensions.projects[idx].name,
					}))
					.concat([
						{
							path: 'settings',
							name: VIEWS.PROJECT_SETTINGS,
							components: {
								default: ProjectSettings,
								sidebar: MainSidebar,
							},
							meta: {
								middleware: ['authenticated', 'custom'],
								middlewareOptions: {
									custom: (options) => {
										const project = useProjectsStore().myProjects.find(
											(p) => p.id === options?.to.params.projectId,
										);
										return !!getResourcePermissions(project?.scopes).project.update;
									},
								},
							},
						},
					]),
			},
		],
	},
	{
		path: '/home',
		name: VIEWS.HOMEPAGE,
		meta: {
			middleware: ['authenticated'],
		},
		redirect: '/home/workflows',
		children: commonChildRoutes.map((route, idx) => ({
			...route,
			name: commonChildRouteExtensions.home[idx].name,
		})),
	},
	{
		path: '/:tenantId/home',
		name: VIEWS.HOMEPAGE_WITH_TENANT,
		meta: {
			middleware: ['authenticated'],
		},
		redirect: (to) => `/${to.params.tenantId}/home/workflows`,
		children: commonChildRoutes.map((route, idx) => ({
			...route,
			name: `${commonChildRouteExtensions.home[idx].name}_WITH_TENANT`,
		})),
	},
	{
		path: '/workflows',
		redirect: '/home/workflows',
	},
	{
		path: '/:tenantId/workflows',
		redirect: (to) => `/${to.params.tenantId}/home/workflows`,
	},
	{
		path: '/credentials',
		redirect: () => '/1/home/credentials',
	},
	{
		path: '/:tenantId/credentials',
		redirect: (to) => `/${to.params.tenantId}/home/credentials`,
	},
	{
		path: '/executions',
		redirect: () => '/1/home/executions',
	},
];
