import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";

// Error screen for a page that crashed. Used as the router's default, so it
// renders inside the app layout (top bar and bottom nav stay usable); the
// root route uses the `fullScreen` variant, as there's no layout left then.
export function RouteError({ error, reset, fullScreen = false }: ErrorComponentProps & { fullScreen?: boolean }) {
  const router = useRouter();
  console.error(error);
  const message = error instanceof Error ? error.message : error ? String(error) : "";
  const retry = () => {
    reset();
    router.invalidate();
  };
  return (
    <div className={fullScreen ? "flex min-h-screen items-center justify-center bg-background px-4" : "py-16 px-4 flex justify-center"}>
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-display text-gold">Something disrupted the duel</h1>
        {message && <p className="mt-2 text-sm text-muted-foreground break-words">{message}</p>}
        <div className="mt-6 flex flex-wrap gap-2 justify-center">
          <button onClick={retry} className="rounded-md gold-gradient px-4 py-2 font-medium text-background">Try again</button>
          <Link to="/" className="rounded-md border border-gold/40 px-4 py-2 font-medium text-gold">Home</Link>
        </div>
      </div>
    </div>
  );
}
