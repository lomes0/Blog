/**
 * BlogManager Component
 * 
 * This is an example component that demonstrates the new blog structure
 * during the migration phase. It shows how to use posts and series
 * alongside the existing document system.
 */

import React from "react";
import { useBlogData, useBlogActions } from "@/hooks/useBlog";

export const BlogManager: React.FC = () => {
  const { posts, series, publishedPosts, totalPosts, totalSeries } = useBlogData();
  const { loadBlogData, createPost, createSeries } = useBlogActions();

  React.useEffect(() => {
    // Load blog data when component mounts
    loadBlogData();
  }, [loadBlogData]);

  const handleCreateSamplePost = () => {
    const samplePost = {
      id: `post-${Date.now()}`,
      name: "Sample Blog Post",
      type: "DOCUMENT" as const,
      head: `revision-${Date.now()}`,
      data: { root: { children: [], direction: null, format: "", indent: 0, type: "root", version: 1 } } as any,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      published: true,
      private: false,
    } as any; // Cast to maintain compatibility during transition
    createPost(samplePost);
  };

  const handleCreateSampleSeries = () => {
    createSeries({
      title: "Sample Blog Series",
      description: "A sample series to demonstrate the new blog structure",
    });
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>Blog Manager (Phase 1.2 Demo)</h1>
      
      <div style={{ marginBottom: "20px" }}>
        <h2>Blog Statistics</h2>
        <ul>
          <li>Total Posts: {totalPosts}</li>
          <li>Published Posts: {publishedPosts.length}</li>
          <li>Total Series: {totalSeries}</li>
        </ul>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <h2>Actions</h2>
        <button
          onClick={handleCreateSamplePost}
          style={{ marginRight: "10px", padding: "8px 16px" }}
        >
          Create Sample Post
        </button>
        <button
          onClick={handleCreateSampleSeries}
          style={{ padding: "8px 16px" }}
        >
          Create Sample Series
        </button>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <h2>Recent Posts</h2>
        {posts.length === 0 ? (
          <p>No posts yet. Create one to get started!</p>
        ) : (
          <ul>
            {posts.slice(0, 5).map((post) => (
              <li key={post.id}>
                <strong>{(post.cloud as any)?.name || "Untitled"}</strong>
                {(post.cloud as any)?.published && <span style={{ color: "green" }}> (Published)</span>}
                {(post.cloud as any)?.private && <span style={{ color: "orange" }}> (Private)</span>}
                <br />
                <small>Updated: {(post.cloud as any)?.updatedAt ? new Date((post.cloud as any).updatedAt).toLocaleDateString() : "Unknown"}</small>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2>Series</h2>
        {series.length === 0 ? (
          <p>No series yet. Create one to organize your posts!</p>
        ) : (
          <ul>
            {series.map((s) => (
              <li key={s.id}>
                <strong>{s.title}</strong>
                {s.description && <p style={{ margin: "4px 0", fontStyle: "italic" }}>{s.description}</p>}
                <small>Posts in series: {s.posts?.length || 0}</small>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginTop: "30px", padding: "15px", backgroundColor: "#f0f0f0", borderRadius: "5px" }}>
        <h3>🚧 Migration Status: Phase 1.2 Complete</h3>
        <p><strong>✅ Completed:</strong></p>
        <ul>
          <li>Repository layer transformation (posts & series)</li>
          <li>API route adapters (/api/posts, /api/series)</li>
          <li>Redux store updates (posts & series state)</li>
          <li>Custom hooks for blog management</li>
        </ul>
        <p><strong>🔄 During Transition:</strong></p>
        <ul>
          <li>Both document and post/series systems coexist</li>
          <li>Domain functionality removed in favor of series</li>
          <li>Type compatibility maintained with casting</li>
        </ul>
        <p><strong>⏭️ Next Phase:</strong> Database schema updates and component migration</p>
      </div>
    </div>
  );
};

export default BlogManager;
