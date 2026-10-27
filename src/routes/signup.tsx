import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  head: () => ({ meta: [{ title: "Sign up — YGO Recap" }] }),
});

const schema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_-]+$/, "Letters, numbers, _ or - only"),
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(72),
});

function SignupPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) navigate({ to: "/profile" }); }, [user, navigate]);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setLoading(true);
    try {
      // A taken name would otherwise be silently changed by the DB (e.g. "Yugi" → "Yugi482").
      // If the check itself is unavailable, sign-up goes on as before.
      const { data: free, error: freeErr } = await supabase.rpc("username_available" as never, { _username: parsed.data.username } as never);
      if (!freeErr && (free as unknown) === false) { toast.error("That duelist name is already taken: pick another one."); return; }

      const redirectUrl = typeof window !== "undefined" ? `${window.location.origin}/profile` : undefined;
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: { data: { username: parsed.data.username }, emailRedirectTo: redirectUrl },
      });
      if (error) { toast.error(error.message); return; }
      // An email that's already registered gets no error, just a user without
      // identities — and no confirmation email is sent.
      if (data.user && data.user.identities?.length === 0) { toast.error("This email is already registered: sign in with your account."); return; }
      // Without email confirmation the account is already signed in.
      if (data.session) { toast.success("Welcome, duelist!"); navigate({ to: "/profile" }); return; }
      toast.success("Account created — check your email to verify.");
      navigate({ to: "/login" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-12">
      <div className="card-mystic rounded-xl p-8">
        <h1 className="font-display text-3xl gold-text text-center mb-6">Become a Duelist</h1>
        <form onSubmit={handle} className="space-y-4">
          <div>
            <Label htmlFor="username">Duelist name</Label>
            <Input id="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
          <Button type="submit" disabled={loading} className="w-full gold-gradient text-background hover:opacity-90">
            {loading ? "Summoning…" : "Create Account"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already a duelist? <Link to="/login" className="text-gold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
