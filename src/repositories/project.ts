import { prisma } from "@/lib/prisma";
import { orderBy } from "@/lib/orderArray";
import { rankForAppend, reRankSeriesIntoRoot, syncOrder } from "./ordering";
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
  // The order of this project's member series. Sent to the client, which is
  // where a project's children are ordered — the series slice carries every
  // series and joins them by `projectId`
  // (docs/plans/ordering-simplification.md §5).
  seriesOrder: true,
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

/**
 * An author's projects, in root-list order.
 *
 * A project's position lives in `User.rootOrder` alongside the author's
 * standalone posts and ungrouped series — one shared space, so this list is a
 * subset of it rather than an order of its own. Ordering by the array here
 * makes the payload arrive already in the order the client renders; the client
 * re-derives the interleaving anyway, since it is the only side holding all
 * three kinds at once.
 */
export async function findProjectsByAuthorId(
  authorId: string,
): Promise<Project[]> {
  const [projects, author] = await Promise.all([
    prisma.project.findMany({ where: { authorId }, select: projectSelect }),
    prisma.user.findUnique({
      where: { id: authorId },
      select: { rootOrder: true },
    }),
  ]);
  return orderBy(author?.rootOrder ?? [], projects) as Project[];
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

  // The root list gains the id (§6, "Create").
  await syncOrder(prisma, { kind: "root", authorId: data.authorId });

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
    // Empty project: `reRankSeriesIntoRoot` returns early, so root would keep
    // the deleted id.
    await syncOrder(tx, { kind: "root", authorId: project.authorId });
  });
}
