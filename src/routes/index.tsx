import { createFileRoute } from "@tanstack/react-router";
import { KaleidoscopeApp } from "@/components/kaleidoscope-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <KaleidoscopeApp />;
}
