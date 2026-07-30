import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/tournaments")({
  component: () => <Outlet />,
  head: () => ({ meta: [{ title: "Tournaments — YGO Recap" }] }),
});
