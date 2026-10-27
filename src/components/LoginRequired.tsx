import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

// Shown on public pages whose data the database only exposes to signed-in
// users, instead of an empty list or an endless "Loading…".
export function LoginRequired({ message }: { message: string }) {
  return (
    <div className="card-mystic rounded-xl p-10 text-center space-y-4">
      <Lock className="h-10 w-10 mx-auto text-gold" />
      <p className="text-muted-foreground">{message}</p>
      <Link to="/login" className="inline-block rounded-md gold-gradient px-5 py-2 font-medium text-background">Sign in</Link>
    </div>
  );
}
