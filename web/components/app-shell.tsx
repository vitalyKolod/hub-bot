"use client";
import { HubData } from "./hub/data";
import { Shell } from "./hub/shell";
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <HubData>
      <Shell>{children}</Shell>
    </HubData>
  );
}
