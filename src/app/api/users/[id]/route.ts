import {
  ApiError,
  optionalUserRoute,
  parseBody,
  requireOwner,
  userRoute,
} from "@/lib/api-utils";
import { deleteUser, findUser, updateUser } from "@/repositories/user";
import { NextResponse } from "next/server";
import { validate } from "uuid";
import { Prisma, UserRole } from "@prisma/client";
import { validateHandle } from "../utils";
import { z } from "zod";

export const dynamic = "force-dynamic";

// The handle is the only self-service field. `email`, `role` and `disabled` are
// deliberately absent — a user editing their own profile must not be able to
// grant themselves a role or re-point the identity their OAuth account resolves
// to.
// `null` is accepted because the profile dialog sends `handle || null`; as before,
// the handler treats it as "no change" rather than a clear.
const userUpdateSchema = z.object({
  handle: z.string().nullish(),
}).strict();

/**
 * A user's public profile.
 *
 * Email is returned only to the user themselves. This route previously served
 * it to anyone, so walking user ids harvested the address of every account.
 */
export const GET = optionalUserRoute<{ id: string }>(
  async (_request, { params, user: viewer }) => {
    const user = await findUser(params.id);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    return NextResponse.json({
      data: {
        id: user.id,
        handle: user.handle,
        name: user.name,
        ...(viewer?.id === user.id ? { email: user.email } : {}),
        image: user.image,
      },
    });
  },
);

export const PATCH = userRoute<{ id: string }>(
  async (request, { params, user }) => {
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid user id");
    }
    requireOwner(
      params.id,
      user,
      "You are not authorized to update this profile",
    );

    const body = await parseBody(request, userUpdateSchema);

    const input: Prisma.UserUncheckedUpdateInput = {};
    if (body.handle && body.handle !== user.handle) {
      input.handle = body.handle.toLowerCase();
      const validationError = await validateHandle(input.handle);
      if (validationError) {
        throw new ApiError(
          400,
          validationError.title,
          validationError.subtitle,
        );
      }
    }

    const result = await updateUser(params.id, input);

    return NextResponse.json({
      data: {
        id: result.id,
        handle: result.handle,
        name: result.name,
        email: result.email,
        image: result.image,
      },
    });
  },
  { signInMessage: "Please sign in to update your profile" },
);

export const DELETE = userRoute<{ id: string }>(
  async (_request, { params, user }) => {
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid user id");
    }
    if (user.role !== UserRole.ADMIN) {
      throw new ApiError(
        403,
        "Forbidden",
        "You are not authorized to delete this user",
      );
    }
    await deleteUser(params.id);
    return NextResponse.json({ data: params.id });
  },
  { signInMessage: "Please sign in to delete this user" },
);
