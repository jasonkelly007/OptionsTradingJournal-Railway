import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        window.location.href = "/";
      } else {
        const error = await response.text();
        toast({
          title: "Login Failed",
          description: error || "Invalid credentials",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to connect to server",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/60 shadow-2xl">
        <CardHeader className="text-center pt-8 pb-4">
          {/* Rocket Logo — Rocket Sniper style */}
          <div className="flex flex-col items-center gap-2 mb-4">
            <span className="text-6xl leading-none select-none" role="img" aria-label="rocket">🚀</span>
            <div className="flex flex-col items-center">
              <h1 className="text-3xl font-black tracking-tight">
                <span className="text-foreground">ROCKET</span>
                <span className="text-primary">RAILS</span>
              </h1>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
                Stay on Track to the Moon
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Sign in to your trading journal</p>
        </CardHeader>
        <CardContent className="pb-8">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-2">
                Username
              </label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Launch Dashboard 🚀"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}