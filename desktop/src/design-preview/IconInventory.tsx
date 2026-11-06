import {
  ArrowLeft, ArrowUp, Bell, BookMarked, Bot, CalendarCheck2, Check, ChevronDown, ChevronRight,
  ClipboardCheck, ClipboardList, ClipboardX, ExternalLink, FileInput, FileSearch,
  Files, FileText, FolderPlus, Folders, GitCompareArrows, HardDrive, History, Import,
  Inbox, LayoutDashboard, Library, ListChecks, LoaderCircle, MessageCircle, NotebookPen,
  PackagePlus, Palette, PanelLeftClose, PanelLeftOpen, Play, Plug, Plus, RefreshCw,
  Repeat2, RotateCcw, Save, Settings, Settings2, Square, X,
} from "lucide-react";
import { toolBranding } from "../tool-connections";

const groups = [
  ["사이드바 메뉴", [
    [LayoutDashboard, "LayoutDashboard", "요약"],
    [MessageCircle, "MessageCircle", "대화 · 이 맥락으로 질문 · AI 분석과 비교"],
    [CalendarCheck2, "CalendarCheck2", "작업·일정"],
    [NotebookPen, "NotebookPen", "일간·주간 회고"],
    [Files, "Files", "기록·문서"],
    [FileSearch, "FileSearch", "사용 분석"],
    [Library, "Library", "조사"],
    [BookMarked, "BookMarked", "학습"],
    [Folders, "Folders", "프로젝트"],
    [GitCompareArrows, "GitCompareArrows", "변경안 검토 · 내용 변경 검토 · 변경안 검토·적용"],
    [Settings2, "Settings2", "설정 열기"],
  ]],
  ["설정과 알림", [
    [Bot, "Bot", "AI 도구 설정"],
    [Palette, "Palette", "화면 설정"],
    [HardDrive, "HardDrive", "기록·수집 설정"],
    [Bell, "Bell", "상단 알림 · 알림·회고 설정"],
    [Settings, "Settings", "앱 관리 설정"],
    [Plug, "Plug", "AI 도구 연결"],
    [PackagePlus, "PackagePlus", "AI 도구 스킬 업데이트"],
  ]],
  ["화면 조작과 상태", [
    [PanelLeftClose, "PanelLeftClose", "사이드바 접기"],
    [PanelLeftOpen, "PanelLeftOpen", "사이드바 펼치기"],
    [ArrowLeft, "ArrowLeft", "설정에서 작업 공간으로 돌아가기"],
    [ChevronRight, "ChevronRight", "현재 위치 구분 · 닫힌 목록 행"],
    [ChevronDown, "ChevronDown", "열린 목록 행"],
    [RefreshCw, "RefreshCw", "새로고침 · 문서·연결 상태 다시 확인"],
    [X, "X", "알림·오류 닫기 · 작성 중인 문서 항목 제거 · 미리보기 안내 닫기"],
    [LoaderCircle, "LoaderCircle", "작업 공간 로딩 · 처리 중 · AI 응답 대기"],
    [Inbox, "Inbox", "프로젝트 연결 안내 · 문서·분석·실적 빈 상태"],
  ]],
  ["문서·기록·대화", [
    [FolderPlus, "FolderPlus", "프로젝트 추가 · 폴더 선택과 연결"],
    [Plus, "Plus", "작업 · 학습 주제 · 조사 자료 · 새 문서 추가"],
    [Save, "Save", "학습 주제 · 조사 자료 저장"],
    [FileText, "FileText", "연결한 문서 보기 · 문서 제목"],
    [ExternalLink, "ExternalLink", "조사 자료 원문 열기"],
    [ClipboardList, "ClipboardList", "해석 수정의 근거로 선택"],
    [History, "History", "AI 기록 가져오기 설정 · 기록 수집 상태"],
    [Import, "Import", "AI 대화 기록 가져오기"],
    [Repeat2, "Repeat2", "AI 기록 수집 켜기"],
    [FileInput, "FileInput", "변경안 가져오기"],
    [ArrowUp, "ArrowUp", "질문하기"],
  ]],
  ["작업과 확인", [
    [ListChecks, "ListChecks", "프로젝트의 작업·완료 기준 확인"],
    [Play, "Play", "본인 작업 기록 시작"],
    [Square, "Square", "본인 작업 기록 중지"],
    [Check, "Check", "작업 완료"],
    [RotateCcw, "RotateCcw", "완료한 작업 다시 열기"],
    [ClipboardCheck, "ClipboardCheck", "사용자 확인 기록"],
    [ClipboardX, "ClipboardX", "사용자 확인 취소"],
  ]],
] as const;

const iconCount = groups.reduce((count, [, icons]) => count + icons.length, 0);

export default function IconInventory() {
  return <div className="system-stack">
    <p className="muted">데스크톱에서 쓰는 Lucide 아이콘 {iconCount}종과 브랜드 로고를 모았습니다. 같은 아이콘의 용도는 한 카드에 표시합니다.</p>
    {groups.map(([category, icons]) => <section className="panel system-section" key={category} aria-label={category}>
      <h2>{category}</h2>
      <ul className="system-icon-grid">
        {icons.map(([Icon, name, usage]) => <li className="system-icon-tile" key={name}>
          <Icon size={24} aria-hidden="true" />
          <code>{name}</code>
          <span>{usage}</span>
        </li>)}
      </ul>
    </section>)}
    <section className="panel system-section" aria-label="브랜드와 기본 입력 기호">
      <h2>브랜드와 기본 입력 기호</h2>
      <ul className="system-icon-grid">
        <li className="system-icon-tile">
          <img src="/branding/silolink-app-icon.png" width="32" height="32" alt="" />
          <strong>SiloLink 심볼</strong>
          <span>앱 헤더 · Windows 창과 트레이 · 설치·제거 프로그램 · CLI 실행 파일</span>
        </li>
        {Object.entries(toolBranding).map(([host, { label, logo }]) => <li className="system-icon-tile" key={host}>
          <img className={`tool-logo--${host}`} src={logo} width="24" height="24" alt="" />
          <strong>{label}</strong>
          <span>설정의 AI 도구 연결 카드</span>
        </li>)}
        <li className="system-icon-tile">
          <label htmlFor="icon-select-example">선택 화살표</label>
          <select id="icon-select-example" defaultValue="SiloLink"><option>SiloLink</option></select>
          <span>프로젝트와 설정 선택</span>
        </li>
        <li className="system-icon-tile">
          <label htmlFor="icon-schedule-example">날짜·시간 선택</label>
          <input id="icon-schedule-example" type="datetime-local" />
          <span>작업 일정</span>
        </li>
        <li className="system-icon-tile">
          <label htmlFor="icon-time-example">시간 선택</label>
          <input id="icon-time-example" type="time" defaultValue="21:30" />
          <span>하루 마감 시각</span>
        </li>
        <li className="system-icon-tile">
          <label className="inline"><input type="checkbox" defaultChecked /> 체크 표시</label>
          <span>작업 완료 · 자료 선택</span>
        </li>
      </ul>
      <p className="micro">기본 입력 기호는 WebView에서 그립니다. 디자인 미리보기는 같은 아이콘을 예시에 재사용하며, 미리보기 안내를 닫을 때도 X를 씁니다.</p>
    </section>
  </div>;
}
