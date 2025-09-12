/**
 * Types for fine-grained post partitioning control
 */

// Supported partitioning granularities
export type PartitionGranularity =
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "halfyear"
  | "year";

// Configuration for post partitioning
export interface PartitionConfig {
  granularity: PartitionGranularity;
  limit?: number; // Max number of posts per partition
  offset?: number; // For pagination
}

// Generic group structure that can represent any time period
export interface TimeGroup {
  timeKey: string; // "2024-01" for month, "2024-01-15" for day, etc.
  timeLabel: string; // "January 2024", "January 15, 2024", etc.
  posts: UserDocument[];
  count: number;
  granularity: PartitionGranularity;
}

// API query parameters for posts endpoint
export interface PostsQueryParams {
  groupBy?: PartitionGranularity;
  limit?: number;
  offset?: number;
  authorId?: string;
  published?: boolean;
}

// Response from posts API with partitioning support
export interface PartitionedPostsResponse {
  data?: TimeGroup[];
  totalCount?: number;
  hasMore?: boolean;
  error?: {
    title: string;
    subtitle?: string;
  };
}

import { UserDocument } from "@/types";
