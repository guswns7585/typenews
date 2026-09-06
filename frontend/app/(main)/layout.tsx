import { LegacyShell } from "@/components/layout/legacy-shell";
import { SmoothTabTransition } from "@/components/layout/smooth-tab-transition";

export default function MainLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <LegacyShell>
      <SmoothTabTransition>{children}</SmoothTabTransition>
    </LegacyShell>
  );
}
