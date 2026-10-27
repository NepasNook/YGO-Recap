import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function UserAvatar({ url, name, className }: { url?: string | null; name: string; className?: string }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <Avatar className={cn("border border-gold/30", className)}>
      {url && <AvatarImage src={url} alt={name} />}
      <AvatarFallback className="bg-gold/15 text-gold font-display">{initial}</AvatarFallback>
    </Avatar>
  );
}
