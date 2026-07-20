import { EventContent } from "@/components/event/event-content";
import { LegacyShell } from "@/components/layout/legacy-shell";

export default function EventPage() {
  return (
    <LegacyShell showTypingChrome={false}>
      <EventContent />
    </LegacyShell>
  );
}
