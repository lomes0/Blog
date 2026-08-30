import { apiClient } from "@/api";
import { createApiThunk } from "./createApiThunk";

interface ProjectCreateInput {
  title: string;
  description?: string;
}

export const loadProjects = createApiThunk(
  "app/loadProjects",
  async () => (await apiClient.projects.list()) ?? [],
);

export const createProject = createApiThunk(
  "app/createProject",
  async (arg: ProjectCreateInput) => await apiClient.projects.create(arg),
);

export const updateProject = createApiThunk(
  "app/updateProject",
  async (
    { id, data }: {
      id: string;
      data: { title?: string; description?: string };
    },
  ) => await apiClient.projects.update(id, data),
);

// A project has no container to change — it only ever lives in the author's
// root list — so it has no move of its own. Reordering one is a `setOrder` on
// root, exactly as it is for a standalone post or an ungrouped series
// (docs/plans/archive/ordering-simplification.md §4).

export const deleteProject = createApiThunk(
  "app/deleteProject",
  async (id: string) => await apiClient.projects.delete(id),
);
