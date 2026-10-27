import { Link, useLocation } from "@tanstack/react-router";
import { Home, Swords, Trophy, User, Shield, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";

const baseItems = [
  { to: "/", label: "Home", icon: Home },
  { to: "/duel/new", label: "Duel", icon: Swords },
  { to: "/tournaments", label: "Cups", icon: Trophy },
  { to: "/h2h", label: "VS", icon: Users },
  { to: "/profile", label: "Profile", icon: User },
];
const adminItem = { to: "/admin", label: "Admin", icon: Shield };

// Inside a duel (not the page that starts one) the menu bars are hidden on a
// phone (narrow, or held sideways so it's short): the board needs the room.
const isDuelRoom = (pathname: string) => /^\/duel\/(?!new\/?$)[^/]+\/?$/.test(pathname);
const HIDDEN_ON_PHONE = "max-md:hidden [@media(max-height:499px)]:hidden";

export function BottomNav() {
  const { pathname } = useLocation();
  const { isAdmin } = useAuth();
  const items = isAdmin ? [...baseItems, adminItem] : baseItems;
  return (
    <nav className={cn("fixed bottom-0 inset-x-0 z-50 border-t border-gold/30 bg-background/95 backdrop-blur-md md:hidden", isDuelRoom(pathname) && HIDDEN_ON_PHONE)}>
      <ul className={cn("grid", isAdmin ? "grid-cols-6" : "grid-cols-5")}>{/* dynamic */}
        {items.map((it) => {
          const active = pathname === it.to || (it.to !== "/" && pathname.startsWith(it.to));
          const Icon = it.icon;
          return (
            <li key={it.to}>
              <Link to={it.to} className={cn("flex flex-col items-center gap-1 py-2.5 text-xs", active ? "text-gold" : "text-muted-foreground")}>
                <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_6px_oklch(0.82_0.16_88/0.6)]")} />
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
  const { pathname } = useLocation();
  return (
    <header className={cn("sticky top-0 z-40 border-b border-gold/20 bg-background/85 backdrop-blur-md", isDuelRoom(pathname) && HIDDEN_ON_PHONE)}>
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <img src="/favicon-64.png" alt="" width={32} height={32} className="h-8 w-8 rounded-md object-cover shadow-[0_0_18px_-2px_oklch(0.82_0.16_88/0.6)]" />
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
          <Link key={it.to} to={it.to} className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition", active ? "text-gold bg-gold/10" : "text-muted-foreground hover:text-foreground")}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
