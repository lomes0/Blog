import { authOptions } from "@/lib/auth";
import {
  findSeriesById,
  updateSeries,
  deleteSeries,
} from "@/repositories/series";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Series response types (temporary until we add them to types.ts)
interface GetSeriesResponse {
  data?: any;
  error?: { title: string; subtitle?: string };
}

interface PatchSeriesResponse {
  data?: any;
  error?: { title: string; subtitle?: string };
}

interface DeleteSeriesResponse {
  data?: string;
  error?: { title: string; subtitle?: string };
}

interface SeriesUpdateInput {
  title?: string;
  description?: string;
}

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const response: GetSeriesResponse = {};
  try {
    const series = await findSeriesById(params.id);
    if (!series) {
      response.error = { title: "Series not found" };
      return NextResponse.json(response, { status: 404 });
    }
    
    response.data = series;
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.log(error);
    response.error = {
      title: "Something went wrong",
      subtitle: "Please try again later",
    };
    return NextResponse.json(response, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const response: PatchSeriesResponse = {};
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      response.error = {
        title: "Unauthorized",
        subtitle: "Please sign in to update the series",
      };
      return NextResponse.json(response, { status: 401 });
    }
    
    const { user } = session;
    if (user.disabled) {
      response.error = {
        title: "Account Disabled",
        subtitle: "Account is disabled for violating terms of service",
      };
      return NextResponse.json(response, { status: 403 });
    }
    
    const series = await findSeriesById(params.id);
    if (!series) {
      response.error = { title: "Series not found" };
      return NextResponse.json(response, { status: 404 });
    }
    
    const isAuthor = user.id === series.authorId;
    if (!isAuthor) {
      response.error = {
        title: "Unauthorized",
        subtitle: "You are not authorized to update this series",
      };
      return NextResponse.json(response, { status: 403 });
    }
    
    const body = await request.json() as SeriesUpdateInput;
    if (!body) {
      response.error = {
        title: "Bad Request",
        subtitle: "No series data provided",
      };
      return NextResponse.json(response, { status: 400 });
    }

    response.data = await updateSeries(params.id, body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.log(error);
    response.error = {
      title: "Something went wrong",
      subtitle: "Please try again later",
    };
    return NextResponse.json(response, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const response: DeleteSeriesResponse = {};
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      response.error = {
        title: "Unauthorized",
        subtitle: "Please sign in to delete the series",
      };
      return NextResponse.json(response, { status: 401 });
    }
    
    const { user } = session;
    if (user.disabled) {
      response.error = {
        title: "Account Disabled",
        subtitle: "Account is disabled for violating terms of service",
      };
      return NextResponse.json(response, { status: 403 });
    }
    
    const series = await findSeriesById(params.id);
    if (!series) {
      response.error = { title: "Series not found" };
      return NextResponse.json(response, { status: 404 });
    }
    
    const isAuthor = user.id === series.authorId;
    if (!isAuthor) {
      response.error = {
        title: "Unauthorized",
        subtitle: "You are not authorized to delete this series",
      };
      return NextResponse.json(response, { status: 403 });
    }
    
    await deleteSeries(params.id);
    response.data = params.id;
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.log(error);
    response.error = {
      title: "Something went wrong",
      subtitle: "Please try again later",
    };
    return NextResponse.json(response, { status: 500 });
  }
}
