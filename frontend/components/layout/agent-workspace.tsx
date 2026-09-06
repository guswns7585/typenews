"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  Circle,
  CircleDashed,
  Code2,
  FileCode2,
  Folder,
  GitPullRequest,
  Globe2,
  Grid2X2,
  History,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Square,
  SquareTerminal,
  TerminalSquare,
  X,
} from "lucide-react";
import { SettingsMenu } from "@/components/settings/settings-menu";
import { AnalyticsMenu } from "@/components/settings/analytics-menu";
import { useUiLanguage } from "@/lib/ui-language";

export type AgentTheme = "codex" | "claude" | "claude-code";

function WindowControls() {
  return (
    <div className="agent-window-controls" aria-hidden="true">
      <span>−</span>
      <Square size={10} />
      <X size={13} />
    </div>
  );
}

export function AgentChrome({
  theme,
  showSettings,
}: {
  theme: AgentTheme;
  showSettings: boolean;
}) {
  const { t } = useUiLanguage();

  if (theme === "claude-code") {
    return (
      <div className="agent-chrome is-claude-code">
        <div className="cc-tab-strip" aria-hidden="true">
          <span className="cc-tab is-active"><TerminalSquare size={13} /> {t("문장 품질 세션", "Prompt quality session")}</span>
          <span className="cc-tab"><SquareTerminal size={13} /> {t("명령 프롬프트", "Command Prompt")}</span>
          <Plus size={14} />
          <ChevronDown size={13} />
        </div>
        <div className="agent-title-actions">
          {showSettings ? <><AnalyticsMenu /><SettingsMenu /></> : null}
          <WindowControls />
        </div>
      </div>
    );
  }

  return (
    <div className={`agent-chrome is-${theme}`}>
      <div className="agent-title-left" aria-hidden="true">
        {theme === "codex" ? (
          <>
            <PanelLeft size={15} />
            <ArrowLeft size={15} />
            <ArrowRight size={15} />
            <div className="codex-window-menu">
              <span>{t("파일", "File")}</span>
              <span>{t("편집", "Edit")}</span>
              <span>{t("보기", "View")}</span>
              <span>{t("도움말", "Help")}</span>
            </div>
          </>
        ) : (
          <>
            <Menu size={15} />
            <PanelLeft size={15} />
            <Search size={15} />
            <ArrowLeft size={15} />
            <ArrowRight size={15} />
          </>
        )}
      </div>
      <div className="agent-title-center" aria-hidden="true">
        {theme === "codex" ? null : <><Search size={13} /> {t("대화 및 프로젝트 검색", "Search chats and projects")}</>}
      </div>
      <div className="agent-title-actions">
        {theme === "claude" ? <><SquareTerminal size={14} /><Globe2 size={14} /><MoreHorizontal size={15} /></> : null}
        {showSettings ? <><AnalyticsMenu /><SettingsMenu /></> : null}
        <WindowControls />
      </div>
    </div>
  );
}

function CodexSidebar() {
  const { t } = useUiLanguage();
  return (
    <aside className="agent-sidebar is-codex" aria-hidden="true">
      <div className="agent-sidebar-brand"><strong>Codex</strong><ChevronDown size={13} /><span /><Search size={14} /><Bell size={14} /></div>
      <div className="agent-sidebar-primary">
        <div><MessageSquareText size={15} /> {t("새 채팅", "New chat")}</div>
        <div><GitPullRequest size={15} /> {t("풀 리퀘스트", "Pull requests")}</div>
        <div><Grid2X2 size={15} /> {t("사이트", "Sites")}</div>
        <div><History size={15} /> {t("예약", "Automations")}</div>
        <div><CircleDashed size={15} /> {t("플러그인", "Plugins")}</div>
      </div>
      <span className="agent-sidebar-label">{t("프로젝트", "Projects")}</span>
      <div className="codex-project-list">
        <div><Folder size={14} /> TypeNews Lab</div>
        <div className="is-active">{t("문장 품질 검토", "Prompt quality review")}</div>
        <div><Folder size={14} /> Feed Studio</div>
        <div>{t("뉴스 정제 샘플 점검", "Review feed samples")}</div>
        <div><Folder size={14} /> Interface Notes</div>
        <div>{t("접근성 메모 정리", "Organize accessibility notes")}</div>
      </div>
      <div className="agent-sidebar-footer">
        <span className="agent-avatar">TN</span>
        <span><strong>TypeNews Lab</strong><small>{t("로컬 작업 공간", "Local workspace")}</small></span>
      </div>
    </aside>
  );
}

function ClaudeSidebar() {
  const { t } = useUiLanguage();
  return (
    <aside className="agent-sidebar is-claude" aria-hidden="true">
      <div className="claude-sidebar-tabs"><span>{t("홈", "Home")}</span><strong><Code2 size={13} /> Code</strong></div>
      <div className="agent-sidebar-primary">
        <div><Plus size={16} /> {t("새로 생성", "New chat")}</div>
        <div><Sparkles size={15} /> {t("아티팩트", "Artifacts")}</div>
        <div><Settings2 size={15} /> {t("사용자 지정", "Customize")}</div>
        <div><ChevronDown size={15} /> {t("더보기", "More")}</div>
      </div>
      <div className="claude-workspace-head"><span>TypeNews Lab</span><Plus size={14} /></div>
      <div className="claude-thread-list">
        <div className="is-active"><Circle size={8} /> {t("입력 검수 워크스페이스", "Input review workspace")}</div>
        <div><Circle size={8} /> {t("피드 샘플 분류", "Classify feed samples")}</div>
        <div><Circle size={8} /> {t("테마 사용성 메모", "Theme usability notes")}</div>
        <div><Circle size={8} /> {t("월간 통계 확인", "Monthly metrics review")}</div>
      </div>
      <div className="claude-update-card"><Sparkles size={20} /><span><strong>{t("새 버전이 준비됐습니다", "A new version is ready")}</strong><small>{t("다시 시작하여 업데이트", "Restart to update")}</small></span><ArrowRight size={15} /></div>
      <div className="agent-sidebar-footer">
        <span className="agent-avatar">TN</span>
        <span><strong>TypeNews</strong><small>{t("개인 작업 공간", "Personal workspace")}</small></span>
      </div>
    </aside>
  );
}

function CodexTranscript() {
  const { t } = useUiLanguage();
  return (
    <div className="agent-transcript is-codex">
      <div className="codex-summary" aria-hidden="true">
        <p>{t("문장 검수 화면을 업무 기록처럼 정리했습니다.", "I organized the prompt review surface as a work log.")}</p>
        <ul>
          <li>{t("입력 문장과 결과 지표를 같은 흐름에서 확인", "Prompt and metrics remain in one review flow")}</li>
          <li>{t("언어와 모드 설정은 상단 도구 행에서 유지", "Language and mode settings stay in the toolbar")}</li>
          <li>{t("점수 제출 경로는 기존 엔진을 그대로 사용", "Score submissions keep the existing engine")}</li>
        </ul>
        <div className="codex-change-card">
          <div><FileCode2 size={18} /><span><strong>{t("파일 4개를 검토했습니다", "Reviewed 4 files")}</strong><small>+148 −22</small></span><button type="button" tabIndex={-1}>{t("리뷰", "Review")}</button></div>
          <p><span>src/review/prompt-surface.tsx</span><b>+72 −8</b></p>
          <p><span>src/review/session-metrics.ts</span><b>+41 −6</b></p>
          <p><span>src/review/feed-sample.ts</span><b>+35 −8</b></p>
        </div>
        <div className="codex-run-card">
          <div>
            <TerminalSquare size={16} />
            <strong>{t("문장 품질 검사를 실행했습니다", "Ran prompt quality checks")}</strong>
            <span>{t("완료", "Completed")}</span>
          </div>
          <code>npm run review:prompt-fixtures</code>
          <dl>
            <div><dt>{t("검사한 표본", "Samples checked")}</dt><dd>64</dd></div>
            <div><dt>{t("줄바꿈 통과", "Wrapping passed")}</dt><dd>64</dd></div>
            <div><dt>{t("입력 정렬", "Input alignment")}</dt><dd>64</dd></div>
            <div><dt>{t("검토 메모", "Review notes")}</dt><dd>2</dd></div>
          </dl>
        </div>
        <p className="codex-followup">
          {t("다음 배치에서는 뉴스 본문의 불필요한 기호와 연속 공백을 우선 확인하면 됩니다.", "For the next batch, review uncommon symbols and repeated spaces in news copy first.")}
        </p>
        <div className="codex-review-summary">
          <h4>{t("검토 요약", "Review summary")}</h4>
          <div><span>{t("단문", "Short prompts")}</span><p>{t("한 줄 입력의 기준선과 커서 위치가 안정적으로 유지됩니다.", "The baseline and cursor remain stable for single-line input.")}</p><b>{t("통과", "Passed")}</b></div>
          <div><span>{t("장문", "Long prompts")}</span><p>{t("창 너비에 따라 문장이 자연스럽게 접히고 모든 글자가 표시됩니다.", "Prompts wrap naturally with the window width and keep every character visible.")}</p><b>{t("통과", "Passed")}</b></div>
          <div><span>{t("뉴스", "News copy")}</span><p>{t("연속 공백 두 곳과 일반적이지 않은 구분 기호 두 곳을 검토 목록에 남겼습니다.", "Two repeated spaces and two uncommon separators remain in the review queue.")}</p><em>{t("확인 필요", "Needs review")}</em></div>
        </div>
      </div>
    </div>
  );
}

function ClaudeTranscript() {
  const { t } = useUiLanguage();
  return (
    <div className="agent-transcript is-claude">
      <div className="claude-answer" aria-hidden="true">
        <p>{t("표시 문장과 입력 결과를 확인했습니다. 다음 검수 항목은 아래와 같습니다.", "I reviewed the displayed prompt and input result. The next checks are listed below.")}</p>
        <div className="claude-audit-table">
          <span>1</span><span>{t("문장 줄바꿈", "Prompt wrapping")}</span><b><Check size={13} /></b>
          <span>2</span><span>{t("입력 위치 정렬", "Input alignment")}</span><b><Check size={13} /></b>
          <span>3</span><span>{t("정확도 표시", "Accuracy display")}</span><b><Check size={13} /></b>
          <span>4</span><span>{t("모드 전환 상태", "Mode transition state")}</span><em>{t("검토 중", "Reviewing")}</em>
        </div>
        <h3>{t("검수 세션", "Review session")}</h3>
        <p>{t("아래 활성 입력 영역에서 제시 문장을 입력하면 결과가 즉시 갱신됩니다.", "Type the prompt in the active field below and the result will update immediately.")}</p>
        <div className="claude-review-notes">
          <div><Check size={14} /><span><strong>{t("문장 표본 64개 확인", "Reviewed 64 prompt samples")}</strong><small>{t("잘림 없이 모든 줄이 표시됩니다.", "Every line remains visible without clipping.")}</small></span></div>
          <div><Check size={14} /><span><strong>{t("입력 결과 정렬 확인", "Verified input result alignment")}</strong><small>{t("한 줄과 여러 줄 입력의 시작점이 일치합니다.", "Single-line and multiline inputs share the same origin.")}</small></span></div>
          <div><CircleDashed size={14} /><span><strong>{t("뉴스 기호 규칙 검토 중", "Reviewing news symbol rules")}</strong><small>{t("일반적이지 않은 구분 기호를 별도 표본으로 분류했습니다.", "Uncommon separators were grouped into a separate review set.")}</small></span></div>
        </div>
        <div className="claude-command-snippet">
          <code>review prompts --source daily-feed --limit 64</code>
          <span>{t("검사 64 · 통과 62 · 검토 2", "64 checked · 62 passed · 2 to review")}</span>
        </div>
        <p>{t("검토가 필요한 두 표본은 원문을 훼손하지 않는 범위에서 공백과 구두점만 정리합니다.", "The two flagged samples only need spacing and punctuation cleanup without changing their meaning.")}</p>
        <h3>{t("적용 기준", "Acceptance criteria")}</h3>
        <ol className="claude-policy-list">
          <li>{t("입력 전후에 문장 높이와 시작 위치가 바뀌지 않아야 합니다.", "Prompt height and starting position must remain stable before and during input.")}</li>
          <li>{t("긴 문장은 잘리지 않고 작업 영역 안에서 여러 줄로 표시되어야 합니다.", "Long prompts must wrap inside the workspace without clipping.")}</li>
          <li>{t("정확도와 속도 지표는 현재 제출 엔진의 결과를 그대로 표시해야 합니다.", "Accuracy and speed must continue to reflect the existing submission engine.")}</li>
        </ol>
        <p className="claude-closing-note">{t("이 기준으로 다음 뉴스 표본 묶음을 계속 확인하겠습니다.", "I will continue with the next news sample batch using these criteria.")}</p>
      </div>
    </div>
  );
}

function InAppWorkbench({ theme, children }: { theme: "codex" | "claude"; children: React.ReactNode }) {
  const { t } = useUiLanguage();
  const isCodex = theme === "codex";
  return (
    <div className={`agent-workbench is-${theme}`}>
      {isCodex ? <CodexSidebar /> : <ClaudeSidebar />}
      <section className="agent-chat-pane">
        <header className="agent-chat-head" aria-hidden="true">
          <div><Folder size={15} /><strong>{t("문장 품질 검토", "Prompt quality review")}</strong>{!isCodex ? <small>TypeNews Lab</small> : null}</div>
          <span>{isCodex ? <MoreHorizontal size={16} /> : <><TerminalSquare size={14} /><Square size={12} /><Globe2 size={14} /></>}</span>
        </header>
        {isCodex ? <CodexTranscript /> : <ClaudeTranscript />}
        <div className={`agent-native-composer is-${theme}`}>
          <div className="agent-live-area">{children}</div>
          <div className="agent-native-controls" aria-hidden="true">
            <div>
              <Plus size={16} />
              <span>{isCodex ? t("전체 액세스", "Full access") : t("자동", "Auto")}</span>
              <ArrowDown size={13} />
            </div>
            <div>
              <span>{isCodex ? "GPT-5.6" : "Sonnet 4.5"}</span>
              <ArrowDown size={13} />
              <kbd>↑</kbd>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ClaudeCodeWorkbench({ children }: { children: React.ReactNode }) {
  const { t } = useUiLanguage();
  return (
    <section className="claude-code-workbench">
      <div className="claude-code-terminal">
        <div className="claude-code-welcome" aria-hidden="true">
          <div className="cc-welcome-main">
            <p><b>Claude Code</b> v2.1.6</p>
            <strong>{t("다시 오신 것을 환영합니다", "Welcome back")}</strong>
            <span className="cc-mark">✦</span>
            <small>Sonnet 4.5 · TypeNews Lab<br />C:\workspaces\typing-lab</small>
          </div>
          <div className="cc-recent">
            <strong>{t("최근 활동", "Recent Activity")}</strong>
            <p>3m&nbsp;&nbsp; {t("문장 표본 규칙 검토", "Reviewed prompt sample rules")}</p>
            <p>18m {t("입력 정렬 메모 갱신", "Updated input alignment notes")}</p>
            <p>1d&nbsp;&nbsp; {t("뉴스 피드 표본 분류", "Classified news feed samples")}</p>
            <span>.../resume {t("더 보기", "for more")}</span>
          </div>
        </div>
        <div className="claude-code-output" aria-hidden="true">
          <p><span className="claude-code-prompt">❯</span> {t("제시 문장 표시 규칙을 점검해줘", "Audit the prompt display rules")}</p>
          <p className="claude-code-tool">● Read(src/quality/prompt-audit.ts)</p>
          <p className="claude-code-tool">● Read(fixtures/daily-brief.json)</p>
          <p className="claude-code-tool is-done">● {t("문장 표본 64개를 검사했습니다", "Checked 64 prompt samples")}</p>
          <p className="cc-code-line"><span>12</span> const review = normalizePrompt(sample);</p>
          <p className="cc-code-line"><span>13</span> assertVisible(review.text);</p>
          <p className="cc-code-line is-active"><span>14</span> await verifyTypingSession(review);</p>
          <p className="claude-code-note">{t("활성 문장을 아래 세션에서 직접 확인합니다.", "Review the active prompt in the session below.")}</p>
        </div>
        <div className="claude-code-input-dock">
          <div className="claude-code-live-area">{children}</div>
        </div>
        <div className="claude-code-footer" aria-hidden="true">
          <span>⏵⏵ {t("권한 확인 사용", "permissions enabled")}</span>
          <span className="claude-code-footer-spacer" />
          <span>Sonnet 4.5</span><span>TypeNews Lab</span>
        </div>
      </div>
    </section>
  );
}

export function AgentWorkbench({ theme, children }: { theme: AgentTheme; children: React.ReactNode }) {
  if (theme === "claude-code") return <ClaudeCodeWorkbench>{children}</ClaudeCodeWorkbench>;
  return <InAppWorkbench theme={theme}>{children}</InAppWorkbench>;
}
