"use client";
import SplashScreen from "@/components/shared/SplashScreen";

export default function Error(
  { error }: {
    error: Error & { digest?: string };
    reset: () => void;
  },
) {
  const message = {
    title: "Something went wrong",
    subtitle: `${
      error.digest ? "Error digest: " + error.digest : error.message
    }`,
  };
  return <SplashScreen title={message.title} subtitle={message.subtitle} />;
}
