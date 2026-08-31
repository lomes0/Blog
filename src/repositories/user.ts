import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { validate } from "uuid";

const findUser = async (handle: string) => {
  return prisma.user.findUnique({
    where: validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
  });
};

const findUserByEmail = async (email: string) => {
  return prisma.user.findFirst({
    where: { email },
  });
};

/**
 * Resolve a user the way the *operator* names one: a `User` id or an email.
 *
 * Distinct from `findUser`, which takes an id or a public handle — that is how
 * a URL names a user. This is how `MCP_AUTHOR_ID` and the agent-token CLI do
 * it, neither of which has a URL to work from.
 */
const findUserByRef = async (ref: string) => {
  return prisma.user.findUnique({
    where: validate(ref) ? { id: ref } : { email: ref },
  });
};

const updateUser = async (id: string, data: Prisma.UserUpdateInput) => {
  return prisma.user.update({
    where: { id },
    data,
  });
};

const deleteUser = async (id: string) => {
  return prisma.user.delete({
    where: { id },
  });
};

export {
  deleteUser,
  findUser,
  findUserByEmail,
  findUserByRef,
  updateUser,
};
