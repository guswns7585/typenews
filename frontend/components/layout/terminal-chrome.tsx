"use client";

import { Minus, Square, TerminalSquare, X } from "lucide-react";
import { SettingsMenu } from "@/components/settings/settings-menu";
import { AnalyticsMenu } from "@/components/settings/analytics-menu";

export function TerminalChrome({ showSettings }: { showSettings: boolean }) {
  return (
    <div className="terminal-chrome">
      <div className="terminal-titlebar">
        <span className="terminal-title"><TerminalSquare size={15} /> Command Prompt</span>
        <span className="terminal-path">C:\Windows\System32\cmd.exe</span>
        <div className="terminal-window-actions">
          {showSettings ? <><AnalyticsMenu /><SettingsMenu /></> : null}
          <span aria-hidden="true"><Minus size={14} /></span>
          <span aria-hidden="true"><Square size={11} /></span>
          <span aria-hidden="true" className="terminal-close"><X size={14} /></span>
        </div>
      </div>
    </div>
  );
}

export function TerminalWorkbench({ children }: { children: React.ReactNode }) {
  return (
    <section className="terminal-workbench">
      <div className="terminal-output" aria-hidden="true">
        <div>Microsoft Windows [Version 10.0.26100.4652]</div>
        <div>(c) Microsoft Corporation. All rights reserved.</div>
        <div>&nbsp;</div>
        <div>C:\Users\office&gt;cd Documents\quality-tools</div>
        <div>C:\Users\office\Documents\quality-tools&gt;review-session --source typenews</div>
        <div>&nbsp;</div>
        <div><span className="terminal-green">TypeNews Content Quality Console v2.7.4</span></div>
        <div>Loading prompt queue........................ <span className="terminal-green">OK</span></div>
        <div>Connecting to review workspace.............. <span className="terminal-green">OK</span></div>
        <div>Session ready. Type the prompt exactly as displayed.</div>
        <div className="terminal-rule">-------------------------------------------------------------------------------</div>
      </div>
      <div className="terminal-live-area">{children}</div>
      <div className="terminal-output terminal-after" aria-hidden="true">
        <div className="terminal-rule">-------------------------------------------------------------------------------</div>
        <div>Press SPACE or ENTER to submit · ESC to clear · Ctrl+C to exit</div>
        <div>&nbsp;</div>
        <div>C:\Users\office\Documents\quality-tools&gt;<span className="terminal-block-cursor" /></div>
      </div>
    </section>
  );
}
