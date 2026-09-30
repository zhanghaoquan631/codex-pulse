import type {
  CreatorProject,
  CreatorGitHubConnection,
  CreatorRelease,
  CreatorWorkspaceFile,
  CreatorWorkspaceFileView,
} from '@me-zip/shared-types';
import type { CreatorLabService } from '@me-zip/creator-lab';
import type { CreatorEcosystemProjectGateway } from './index.js';

function ownerPrincipal(ownerId: string) {
  return {
    userId: ownerId,
    sessionId: `creator-ecosystem:${ownerId}`,
    roles: [],
    issuedAt: '1970-01-01T00:00:00.000Z',
  } as const;
}

/** Server-composition-only adapter. It deliberately scopes every Phase 20
 * read to the known project owner before accessing the existing Creator Lab
 * workspace, so public viewers never receive direct workspace access. */
export class CreatorLabEcosystemProjectGateway implements CreatorEcosystemProjectGateway {
  public constructor(private readonly lab: CreatorLabService) {}

  public getOwnedProject(ownerId: string, projectId: string): CreatorProject {
    return this.lab.getProject(ownerPrincipal(ownerId), projectId);
  }

  public listOwnedProjects(ownerId: string): readonly CreatorProject[] {
    return this.lab.listProjects(ownerPrincipal(ownerId), { limit: 100, cursor: null }).items;
  }

  public listOwnedFiles(ownerId: string, projectId: string): readonly CreatorWorkspaceFile[] {
    return this.lab.listFiles(ownerPrincipal(ownerId), projectId);
  }

  public readOwnedFile(ownerId: string, projectId: string, path: string): CreatorWorkspaceFileView {
    return this.lab.readFile(ownerPrincipal(ownerId), projectId, path);
  }

  public listOwnedReleases(ownerId: string, projectId: string): readonly CreatorRelease[] {
    return this.lab.listReleases(ownerPrincipal(ownerId), projectId);
  }

  public getGitHubConnection(ownerId: string): CreatorGitHubConnection | null {
    return this.lab.getGitHubConnection(ownerPrincipal(ownerId));
  }
}
