import { Link, useLocation } from "@tanstack/react-router";
import { Home, Swords, Trophy, User, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";

const baseItems = [
  { to: "/", label: "Home", icon: Home },
  { to: "/duel/new", label: "Duel", icon: Swords },
  { to: "/tournaments", label: "Cups", icon: Trophy },
  { to: "/profile", label: "Profile", icon: User },
];
const adminItem = { to: "/admin", label: "Admin", icon: Shield };

export function BottomNav() {
  const { pathname } = useLocation();
  const { isAdmin } = useAuth();
  const items = isAdmin ? [...baseItems, adminItem] : baseItems;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-gold/30 bg-background/95 backdrop-blur-md md:hidden">
      <ul className={cn("grid", isAdmin ? "grid-cols-5" : "grid-cols-4")}>
        {/* dynamic */}
        {items.map((it) => {
          const active = pathname === it.to || (it.to !== "/" && pathname.startsWith(it.to));
          const Icon = it.icon;
          return (
            <li key={it.to}>
              <Link
                to={it.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-xs",
                  active ? "text-gold" : "text-muted-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5",
                    active && "drop-shadow-[0_0_6px_oklch(0.82_0.16_88/0.6)]",
                  )}
                />
                <span className="font-medium">{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-gold/20 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md gold-gradient grid place-items-center font-display text-background font-bold shadow-[0_0_18px_-2px_oklch(0.82_0.16_88/0.6)]">
            Y
          </div>
          <span className="font-display text-lg gold-text">YGO Recap</span>
        </Link>
        <DesktopNav />
      </div>
    </header>
  );
}

function DesktopNav() {
  const { pathname } = useLocation();
  const { isAdmin } = useAuth();
  const items = isAdmin ? [...baseItems, adminItem] : baseItems;
  return (
    <nav className="hidden md:flex items-center gap-1">
      {items.map((it) => {
        const active = pathname === it.to || (it.to !== "/" && pathname.startsWith(it.to));
        return (
          <Link
            key={it.to}
            to={it.to}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition",
              active ? "text-gold bg-gold/10" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
