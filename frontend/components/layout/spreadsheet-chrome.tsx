"use client";

import {
  AlignCenter,
  Bold,
  ChevronDown,
  Clipboard,
  Cloud,
  FileSpreadsheet,
  Grid2X2,
  Grid3X3,
  Italic,
  MessageSquare,
  PaintBucket,
  Search,
  Share2,
  Sigma,
  Underline,
} from "lucide-react";
import type { InputHTMLAttributes, KeyboardEvent } from "react";
import { SettingsMenu } from "@/components/settings/settings-menu";
import { AnalyticsMenu } from "@/components/settings/analytics-menu";
import { useUiLanguage } from "@/lib/ui-language";
import {
  spreadsheetCellValue,
  useLoafingStore,
} from "@/stores/use-loafing-store";

function EditableCell({
  id,
  fallback,
  className,
  ...props
}: {
  id: string;
  fallback: string;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "className">) {
  const { locale, t } = useUiLanguage();
  const cells = useLoafingStore((state) => state.spreadsheetCells);
  const setCell = useLoafingStore((state) => state.setSpreadsheetCell);
  const value = spreadsheetCellValue(cells, locale, id, fallback);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  return (
    <input
      {...props}
      key={`${locale}:${id}`}
      className={`spreadsheet-editable${className ? ` ${className}` : ""}`}
      type="text"
      value={value}
      maxLength={160}
      spellCheck={false}
      aria-label={t("스프레드시트 셀 편집", "Edit spreadsheet cell")}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={onKeyDown}
      onChange={(event) => setCell(locale, id, event.currentTarget.value)}
    />
  );
}

export function SpreadsheetChrome({ showSettings }: { showSettings: boolean }) {
  const { isEnglish, t } = useUiLanguage();
  const ribbonTabs = isEnglish
    ? ["File", "Home", "Insert", "Share", "Page Layout", "Formulas", "Data", "Review", "View", "Help"]
    : ["파일", "홈", "삽입", "공유", "페이지 레이아웃", "수식", "데이터", "검토", "보기", "도움말"];

  return (
    <div className="spreadsheet-chrome">
      <div className="spreadsheet-titlebar">
        <div className="spreadsheet-quick" aria-hidden="true">
          <Grid3X3 size={16} />
          <FileSpreadsheet size={17} className="spreadsheet-app-mark" />
          <span>{t("TypeNews 업무 현황", "TypeNews Operations")}</span>
          <Cloud size={14} />
        </div>
        <span className="spreadsheet-title-search"><Search size={14} /> {t("도구, 도움말 등을 검색", "Search tools, help, and more")}</span>
        <div className="spreadsheet-title-actions">
          <span className="spreadsheet-title-command" aria-hidden="true"><MessageSquare size={13} /> {t("메모", "Notes")}</span>
          <span className="spreadsheet-title-command is-share" aria-hidden="true"><Share2 size={13} /> {t("공유", "Share")}</span>
          {showSettings ? <><AnalyticsMenu /><SettingsMenu /></> : null}
        </div>
      </div>

      <div className="spreadsheet-ribbon-tabs" aria-hidden="true">
        {ribbonTabs.map((tab, index) => (
          <span key={tab} data-active={index === 1}>{tab}</span>
        ))}
      </div>

      <div className="spreadsheet-ribbon" aria-hidden="true">
        <div className="spreadsheet-ribbon-group is-clipboard">
          <Clipboard size={22} />
          <span>{t("붙여넣기", "Paste")}</span>
          <ChevronDown size={11} />
        </div>
        <div className="spreadsheet-ribbon-group is-font">
          <div className="spreadsheet-ribbon-input">{t("맑은 고딕", "Aptos")} <ChevronDown size={11} /></div>
          <div className="spreadsheet-ribbon-input is-size">11 <ChevronDown size={11} /></div>
          <Bold size={16} />
          <Italic size={16} />
          <Underline size={16} />
          <PaintBucket size={16} />
          <small>{t("글꼴", "Font")}</small>
        </div>
        <div className="spreadsheet-ribbon-group">
          <AlignCenter size={17} />
          <Grid2X2 size={17} />
          <span>{t("맞춤", "Align")}</span>
          <small>{t("맞춤", "Alignment")}</small>
        </div>
        <div className="spreadsheet-ribbon-group">
          <Sigma size={19} />
          <span>{t("자동 합계", "AutoSum")}</span>
          <small>{t("편집", "Editing")}</small>
        </div>
      </div>

      <div className="spreadsheet-formula">
        <span className="spreadsheet-name-box">C10</span>
        <span className="spreadsheet-fx" aria-hidden="true">fx</span>
        <EditableCell
          id="formula-label"
          className="spreadsheet-formula-value"
          fallback={t("실시간 타이핑 검수 · 현재 제시 문장", "Live typing review · current prompt")}
        />
      </div>
    </div>
  );
}

const rowStatus = ["progress", "review", "done", "waiting", "done"] as const;

export function SpreadsheetDataLayer() {
  const { isEnglish, t } = useUiLanguage();
  const headers = isEnglish
    ? ["Date", "Task", "Owner", "Status", "Target", "Done", "Progress"]
    : ["날짜", "작업 항목", "담당", "상태", "목표", "완료", "진행률"];
  const rows = isEnglish
    ? [
        ["2026-07-31", "Review news prompts", "Content", "In progress", "48", "36", "75%"],
        ["2026-07-31", "Edit English copy", "Editorial", "Review", "24", "19", "79%"],
        ["2026-07-30", "Verify RSS intake", "Engineering", "Complete", "120", "120", "100%"],
        ["2026-07-30", "Process typo reports", "Operations", "Waiting", "17", "8", "47%"],
        ["2026-07-29", "Audit ranking data", "Operations", "Complete", "1", "1", "100%"],
      ]
    : [
        ["2026-07-31", "뉴스 문장 검수", "콘텐츠팀", "진행 중", "48", "36", "75%"],
        ["2026-07-31", "영문 문장 교정", "편집팀", "검토", "24", "19", "79%"],
        ["2026-07-30", "RSS 수집 확인", "개발팀", "완료", "120", "120", "100%"],
        ["2026-07-30", "오타 신고 반영", "운영팀", "대기", "17", "8", "47%"],
        ["2026-07-29", "랭킹 데이터 점검", "운영팀", "완료", "1", "1", "100%"],
      ];

  return (
    <div className="spreadsheet-data-layer">
      <EditableCell id="report-title" className="spreadsheet-report-title" fallback={t("7월 콘텐츠 운영 및 타이핑 품질 현황", "July content operations and typing quality")} />
      <EditableCell id="report-meta" className="spreadsheet-report-meta" fallback={t("기준일", "As of")} />
      <EditableCell id="report-date" className="spreadsheet-report-date" fallback="2026-07-31" />
      <div className="spreadsheet-data-table">
        {[headers, ...rows].flatMap((row, rowIndex) =>
          row.map((cell, columnIndex) => (
            <EditableCell
              id={`table-${rowIndex}-${columnIndex}`}
              fallback={cell}
              key={`${rowIndex}-${columnIndex}`}
              data-header={rowIndex === 0 || undefined}
              data-status={columnIndex === 3 && rowIndex > 0 ? rowStatus[rowIndex - 1] : undefined}
            />
          )),
        )}
      </div>
      <EditableCell id="session-label" className="spreadsheet-session-label" fallback={t("타이핑 검수", "Typing QA")} />
      <EditableCell id="note" className="spreadsheet-note" fallback={t("선택한 문장을 입력하고 결과를 확인하세요.", "Enter the selected prompt and review the result.")} />
    </div>
  );
}

export function SpreadsheetEditableGrid() {
  const { locale, t } = useUiLanguage();
  const cells = useLoafingStore((state) => state.spreadsheetCells);
  const setCell = useLoafingStore((state) => state.setSpreadsheetCell);

  return (
    <div className="spreadsheet-edit-grid">
      {Array.from({ length: 24 * 14 }, (_, index) => {
        const row = Math.floor(index / 14) + 1;
        const column = String.fromCharCode(65 + (index % 14));
        const id = `grid-${column}${row}`;
        return (
          <input
            key={`${locale}:${id}`}
            type="text"
            defaultValue={spreadsheetCellValue(cells, locale, id, "")}
            maxLength={80}
            spellCheck={false}
            aria-label={t(`${column}${row} 셀 편집`, `Edit cell ${column}${row}`)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            onBlur={(event) => setCell(locale, id, event.currentTarget.value)}
          />
        );
      })}
    </div>
  );
}
