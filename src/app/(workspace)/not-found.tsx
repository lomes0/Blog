import SplashScreen from "@/components/shared/SplashScreen";
import type { Metadata } from "next";

export const metadata: Metadata = {
  description: "Page not found",
};

const page = () => <SplashScreen title="Page not found" />;

export default page;
