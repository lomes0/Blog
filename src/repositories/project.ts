import { prisma } from "@/lib/prisma";
import { rankForAppend, reRankSeriesIntoRoot } from "./ordering";
import { Project, ProjectCreateInput, ProjectUpdateInput } from "@/types";

// Standard author selection for consistency (matches series repository).
const authorSelect = {
  id: true,
  handle: true,
  name: true,
  email: true,
  image: true,
};

// Project metadata selection. Member series are NOT nested here — the client
// joins series to projects by `series.projectId` (the series slice already
// carries every series with its posts), which avoids duplicating that payload.
const projectSelect = {
  id: true,
  title: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  authorId: true,
  rank: true,
  author: { select: authorSelect },
};

// Find a project by ID
export async function findProjectById(id: string): Promise<Project | null> {
  const project = await prisma.project.findUnique({
    where: { id },
    select: projectSelect,
  });
  return project ? (project as Project) : null;
}

// Find all projects for an author, ordered by their manual root-list rank.
export async function findProjectsByAuthorId(
  authorId: string,
): Promise<Project[]> {
  const projects = await prisma.project.findMany({
    where: { authorId },
    select: projectSelect,
    orderBy: { rank: "asc" },
  });
  return projects as Project[];
}

// Create a project, appended to the end of the author's root list.
export async function createProject(
  data: ProjectCreateInput,
): Promise<Project> {
  const rank = await rankForAppend(prisma, {
    authorId: data.authorId,
    seriesId: null,
    parentId: null,
  });
  await prisma.project.create({
    data: {
      id: data.id,
      title: data.title,
      description: data.description,
      authorId: data.authorId,
      rank,
    },
  });

  const project = await findProjectById(data.id);
  if (!project) {
    throw new Error("Failed to create project");
  }
  return project;
}

// Update a project and return the updated entity.
export async function updateProject(
  id: string,
  data: ProjectUpdateInput,
): Promise<Project> {
  await prisma.project.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    },
  });

  const project = await findProjectById(id);
  if (!project) {
    throw new Error("Failed to update project");
  }
  return project;
}

// Delete a project; its member series are re-homed to the end of the author's
// root list (in their prior order) in the same transaction, so they don't keep
// ranks that belonged to the now-deleted project's space. Posts are untouched.
export async function deleteProject(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id },
      select: { authorId: true },
    });
    if (!project) throw new Error("Project not found");

    const members = await tx.series.findMany({
      where: { projectId: id },
      orderBy: { rank: "asc" },
      select: { id: true },
    });

    await tx.project.delete({ where: { id } });
    await reRankSeriesIntoRoot(tx, project.authorId, members.map((m) => m.id));
  });
}
