import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/components/AuthProvider";
import { BottomNav, TopBar } from "@/components/Nav";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-display gold-text">404</h1>
        <p className="mt-4 text-muted-foreground">This card doesn't exist in the deck.</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-md gold-gradient px-4 py-2 font-medium text-background"
        >
          Return to duel
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-display text-gold">Something disrupted the duel</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={reset}
          className="mt-6 rounded-md gold-gradient px-4 py-2 font-medium text-background"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "YGO Recap — Yu-Gi-Oh! Duel & Tournament Tracker" },
      {
        name: "description",
        content:
          "Track your Yu-Gi-Oh! duels, manage decks, climb the leaderboard and run tournaments.",
      },
      { name: "theme-color", content: "#0a0a1f" },
      { property: "og:title", content: "YGO Recap — Yu-Gi-Oh! Duel & Tournament Tracker" },
      {
        property: "og:description",
        content:
          "Track your Yu-Gi-Oh! duels, manage decks, climb the leaderboard and run tournaments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "YGO Recap — Yu-Gi-Oh! Duel & Tournament Tracker" },
      {
        name: "twitter:description",
        content:
          "Track your Yu-Gi-Oh! duels, manage decks, climb the leaderboard and run tournaments.",
      },
      { name: "twitter:card", content: "summary" },
      // Social preview image: drop a screenshot at public/og.png and re-add
      // { property: "og:image", content: "/og.png" },
      // { name: "twitter:image", content: "/og.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="font-[Inter,sans-serif]">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TopBar />
        <main className="mx-auto max-w-5xl px-4 pb-24 md:pb-8 pt-4">
          <Outlet />
        </main>
        <BottomNav />
        <Toaster theme="dark" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
