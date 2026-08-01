import Home from "@/components/Home";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Modern Blog | Create & Share Knowledge",
  description:
    "A modern blog platform with rich text editing capabilities. Create engaging posts with LaTeX, diagrams, and interactive content. Organize content in series and collaborate with others.",
};

const page = () => <Home />;

export default page;
