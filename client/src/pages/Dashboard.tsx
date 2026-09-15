import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Zap, Shield, Clock, Home, History, User } from "lucide-react";

const navItems = [
  { icon: Home, label: "Home", id: "home" },
  { icon: History, label: "History", id: "history" },
  { icon: User, label: "Account", id: "account" },
] as const;

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [activeTab, setActiveTab] = useState<"home" | "history" | "account">("home");

  const handleSignOut = async () => {
    await authClient.signOut();
    navigate("/login");
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-5 py-4 lg:px-8">
        <Logo className="text-xl" />
        <div className="flex items-center gap-3">
          <Avatar size="sm">
            {user?.image ? <AvatarImage src={user.image} alt="" /> : null}
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
              {(user?.name ?? user?.email ?? "U").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-24 lg:px-8">
        <div className="mb-6">
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Where would you like to go?</p>
        </div>

        <Card className="relative mb-6 overflow-hidden border-border bg-card py-0 ring-0">
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/12 blur-2xl" />
          <CardHeader className="relative pt-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Quick Book</CardTitle>
                <CardDescription>Find a ride near you</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="relative pb-5">
            <Button className="w-full font-semibold" size="lg">
              Search for a ride
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="border-border bg-card py-0 ring-0">
            <CardHeader className="pt-4">
              <div className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <CardTitle>Book a ride</CardTitle>
              <CardDescription>Get going in minutes with a driver nearby.</CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border bg-card py-0 ring-0">
            <CardHeader className="pt-4">
              <div className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-drio-success/15">
                <Shield className="h-4 w-4 text-drio-success" />
              </div>
              <CardTitle>Ride history</CardTitle>
              <CardDescription>Review your past trips and receipts.</CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border bg-card py-0 ring-0">
            <CardHeader className="pt-4">
              <div className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted-foreground/15">
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
              <CardTitle>Become a driver</CardTitle>
              <CardDescription>Earn on your schedule with Drio.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center justify-around py-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center gap-1 px-4 py-1 transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
