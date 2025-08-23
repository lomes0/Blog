import { authOptions } from "@/lib/auth";
import {
  findAllSeries,
  findSeriesByAuthorId,
  createSeries,
} from "@/repositories/series";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

// Series response types (temporary until we add them to types.ts)
interface GetSeriesResponse {
  data?: any[];
  error?: { title: string; subtitle?: string };
}

interface PostSeriesResponse {
  data?: any;
  error?: { title: string; subtitle?: string };
}

interface SeriesCreateInput {
  title: string;
  description?: string;
}

export async function GET() {
  const response: GetSeriesResponse = {};
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      // Return all public series for unauthenticated users
      const allSeries = await findAllSeries();
      response.data = allSeries;
      return NextResponse.json(response, { status: 200 });
    }
    
    const { user } = session;
    if (user.disabled) {
      response.error = {
        title: "Account Disabled",
        subtitle: "Account is disabled for violating terms of service",
      };
      return NextResponse.json(response, { status: 403 });
    }
    
    // Return user's series
    const userSeries = await findSeriesByAuthorId(user.id);
    response.data = userSeries;
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

export async function POST(request: Request) {
  const response: PostSeriesResponse = {};
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      response.error = {
        title: "Unauthorized",
        subtitle: "Please sign in to create a series",
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
    
    const body = await request.json() as SeriesCreateInput;
    if (!body || !body.title) {
      response.error = {
        title: "Bad Request",
        subtitle: "Series title is required",
      };
      return NextResponse.json(response, { status: 400 });
    }

    const seriesData = {
      id: uuidv4(),
      title: body.title,
      description: body.description,
      authorId: user.id,
    };

    response.data = await createSeries(seriesData);
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
