"use client";

import {
  Bell,
  Blocks,
  Braces,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Files,
  GitBranch,
  PanelBottom,
  Play,
  Search,
  Settings2,
} from "lucide-react";
import { SettingsMenu } from "@/components/settings/settings-menu";
import { AnalyticsMenu } from "@/components/settings/analytics-menu";
import { useUiLanguage } from "@/lib/ui-language";

export function VscodeChrome({ showSettings }: { showSettings: boolean }) {
  const { isEnglish } = useUiLanguage();
  const menuItems = isEnglish
    ? ["File", "Edit", "Selection", "View", "Go", "Run", "Terminal", "Help"]
    : ["파일", "편집", "선택 영역", "보기", "이동", "실행", "터미널", "도움말"];
  return (
    <div className="vscode-chrome">
      <div className="vscode-titlebar">
        <div className="vscode-title-left" aria-hidden="true">
          <Braces size={16} className="vscode-mark" />
          {menuItems.map((item) => <span key={item}>{item}</span>)}
        </div>
        <div className="vscode-command" aria-hidden="true">
          <Search size={13} /> TypeNews
        </div>
        <div className="vscode-title-actions">
          <span aria-hidden="true"><PanelBottom size={15} /></span>
          {showSettings ? <><AnalyticsMenu /><SettingsMenu /></> : null}
        </div>
      </div>
      <div className="vscode-nav-row" aria-hidden="true">
        <ChevronLeft size={16} />
        <ChevronRight size={16} />
        <span>TypeNews</span>
        <span>/</span>
        <strong>quality-monitor.ts</strong>
      </div>
    </div>
  );
}

export function VscodeWorkbench({ children }: { children: React.ReactNode }) {
  const { t } = useUiLanguage();
  return (
    <div className="vscode-workbench">
      <aside className="vscode-activity" aria-hidden="true">
        <Files size={24} className="is-active" />
        <Search size={23} />
        <GitBranch size={23} />
        <Play size={23} />
        <Blocks size={23} />
        <span className="vscode-activity-spacer" />
        <CircleUserRound size={23} />
        <Settings2 size={23} />
      </aside>
      <aside className="vscode-explorer" aria-hidden="true">
        <div className="vscode-explorer-title">{t("탐색기", "EXPLORER")}</div>
        <div className="vscode-project-title">⌄ TYPENEWS</div>
        <div className="vscode-file-tree">
          <span>⌄ src</span>
          <span className="is-nested">TS quality-monitor.ts</span>
          <span className="is-nested">TS prompt-normalizer.ts</span>
          <span className="is-nested">JSON review-queue.json</span>
          <span className="is-nested">MD operations-notes.md</span>
          <span>⌄ reports</span>
          <span className="is-nested">CSV quality-summary.csv</span>
        </div>
        <div className="vscode-explorer-section">› {t("개요", "OUTLINE")}</div>
        <div className="vscode-explorer-section">› {t("타임라인", "TIMELINE")}</div>
      </aside>
      <section className="vscode-editor">
        <div className="vscode-editor-tab" aria-hidden="true">
          <Braces size={14} />
          <span>quality-monitor.ts</span>
          <b>×</b>
        </div>
        <div className="vscode-editor-canvas">
          <div className="vscode-line-numbers" aria-hidden="true">
            {Array.from({ length: 34 }, (_, index) => <span key={index}>{index + 1}</span>)}
          </div>
          <div className="vscode-editor-content">
            <div className="vscode-code-block" aria-hidden="true">
              <div><i>import</i> <em>type</em> <b>{"{ TypingMetrics, TypingSession }"}</b> <i>from</i> <q>&quot;@/typing/types&quot;</q>;</div>
              <div><i>import</i> <b>{"{ calculateAccuracy, calculateCpm }"}</b> <i>from</i> <q>&quot;@/typing/metrics&quot;</q>;</div>
              <div>&nbsp;</div>
              <div><i>const</i> <span className="token-blue">session</span>: <em>TypingSession</em> = {"{"}</div>
              <div className="indent"><span className="token-sky">language</span>: <q>&quot;ko&quot;</q>,</div>
              <div className="indent"><span className="token-sky">mode</span>: <q>&quot;short&quot;</q>,</div>
              <div className="indent"><span className="token-sky">startedAt</span>: <em>Date</em>.<span className="token-yellow">now</span>(),</div>
              <div>{"};"}</div>
              <div>&nbsp;</div>
              <div><i>export function</i> <span className="token-yellow">updateTypingSession</span>(<span className="token-blue">input</span>: <em>string</em>) {"{"}</div>
              <div className="indent"><i>const</i> <span className="token-blue">normalized</span> = input.<span className="token-yellow">normalize</span>(<q>&quot;NFC&quot;</q>);</div>
              <div className="indent"><span className="token-comment">{"// Current prompt and live input are rendered on the next lines."}</span></div>
            </div>
            <div className="vscode-live-code">{children}</div>
            <div className="vscode-code-block vscode-code-after" aria-hidden="true">
              <div className="indent"><i>const</i> <span className="token-blue">metrics</span>: <em>TypingMetrics</em> = <span className="token-yellow">measure</span>(normalized);</div>
              <div>&nbsp;</div>
              <div className="indent"><i>return</i> {"{"}</div>
              <div className="indent-2"><span className="token-sky">completed</span>: metrics.<span className="token-sky">accuracy</span> &gt;= <span className="token-green">80</span>,</div>
              <div className="indent-2"><span className="token-sky">recordedAt</span>: <i>new</i> <em>Date</em>().<span className="token-yellow">toISOString</span>(),</div>
              <div className="indent">{"};"}</div>
              <div>{"}"}</div>
            </div>
          </div>
        </div>
      </section>
      <footer className="vscode-statusbar" aria-hidden="true">
        <span><GitBranch size={12} /> main*</span>
        <span>✓ 0</span>
        <span className="vscode-status-spacer" />
        <span>Ln 8, Col 1</span>
        <span>{t("공백", "Spaces")}: 2</span>
        <span>UTF-8</span>
        <span>TypeScript</span>
        <Bell size={12} />
      </footer>
    </div>
  );
}
