import type { Metadata } from "next";
import Privacy from "@/components/Privacy";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What this site stores, what leaves it, and how to remove it",
};

const page = () => <Privacy />;

export default page;
