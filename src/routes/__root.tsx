import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { RouteError } from "@/components/RouteError";
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
        <Link to="/" className="mt-6 inline-block rounded-md gold-gradient px-4 py-2 font-medium text-background">Return to duel</Link>
      </div>
    </div>
  );
}

// Only for errors in the root layout itself; page errors are handled by the
// router's defaultErrorComponent, inside the layout (see router.tsx).
function ErrorComponent(props: ErrorComponentProps) {
  return <RouteError {...props} fullScreen />;
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "YGO Recap — Yu-Gi-Oh! Duel & Tournament Tracker" },
      { name: "description", content: "Track your Yu-Gi-Oh! duels, manage decks, climb the leaderboard and run tournaments." },
      { name: "theme-color", content: "#0a0a1f" },
      { property: "og:title", content: "YGO Recap — Yu-Gi-Oh! Duel & Tournament Tracker" },
      { property: "og:description", content: "Track your Yu-Gi-Oh! duels, manage decks, climb the leaderboard and run tournaments." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "YGO Recap — Yu-Gi-Oh! Duel & Tournament Tracker" },
      { name: "twitter:description", content: "Track your Yu-Gi-Oh! duels, manage decks, climb the leaderboard and run tournaments." },
      { name: "twitter:card", content: "summary" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/23ec9483-d7bf-4b54-ae90-b5a9876e2587/id-preview-55347d7e--99d6c074-f97d-42ad-bf9b-bbac4b2b38b0.lovable.app-1778512701429.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/23ec9483-d7bf-4b54-ae90-b5a9876e2587/id-preview-55347d7e--99d6c074-f97d-42ad-bf9b-bbac4b2b38b0.lovable.app-1778512701429.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon-64.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" },
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
