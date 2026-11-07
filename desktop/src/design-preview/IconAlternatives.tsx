import {
  Activity, AppWindow, ArrowDownToLine, BookMarked, BookOpen, CalendarClock,
  CalendarDays, CalendarSync, ChartColumn, ChartNoAxesCombined, ChevronRight,
  CircleDot, CirclePlay, CirclePlus, ClipboardList, ClockPlus, Dot,
  DatabaseZap, Download, FileDown, FileInput, FileSearch, Minus,
  FileText, Folder, FolderOpen, Folders, GraduationCap, HardDriveDownload,
  History, House, Import, Inbox, Info, Layers2, LayoutDashboard, LayoutGrid,
  Library, Lightbulb, Link2, NotebookPen, Orbit, PackagePlus, Play, Power,
  RefreshCw, Repeat2, ScanLine, Search, Settings, Sparkles, Sunset, Telescope,
  Timer, Upload, Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Candidate = readonly [icon: LucideIcon, name: string, description: string];
type Comparison = {
  title: string;
  location: string;
  chosen: 0 | 1 | 2 | 3 | null;
  current: Candidate;
  alternatives: readonly [Candidate, Candidate, Candidate];
};

const comparisons: Comparison[] = [
  {
    title: "요약", location: "사이드바", chosen: 1,
    current: [Orbit, "Orbit", "궤도 모양에서 전체 현황을 유추하기 어렵습니다."],
    alternatives: [
      [LayoutDashboard, "LayoutDashboard", "프로젝트·작업 현황을 한눈에 보는 화면."],
      [House, "House", "작업 공간의 시작점으로 돌아가는 메뉴."],
      [LayoutGrid, "LayoutGrid", "여러 현황을 모아 보여 주는 화면."],
    ],
  },
  {
    title: "사용 분석", location: "사이드바", chosen: 3,
    current: [ScanLine, "ScanLine", "문서나 QR 코드를 스캔하는 동작처럼 보입니다."],
    alternatives: [
      [ChartNoAxesCombined, "ChartNoAxesCombined", "기록에서 반복 패턴과 추이를 읽는 화면."],
      [ChartColumn, "ChartColumn", "사용 빈도를 비교하는 의미가 강합니다."],
      [FileSearch, "FileSearch", "원문 기록을 검토하는 쪽에 무게를 둡니다."],
    ],
  },
  {
    title: "프로젝트", location: "사이드바", chosen: 1,
    current: [Layers2, "Layers2", "레이어를 관리하는 메뉴처럼 보입니다."],
    alternatives: [
      [Folders, "Folders", "연결한 여러 프로젝트 폴더를 관리하는 화면."],
      [Folder, "Folder", "폴더 하나로 표현해 작은 크기에서도 알아보기 쉽습니다."],
      [FolderOpen, "FolderOpen", "현재 선택한 프로젝트를 열어 보는 느낌이 강합니다."],
    ],
  },
  {
    title: "일간·주간 회고", location: "사이드바", chosen: 1,
    current: [Sunset, "Sunset", "하루 마감은 연상되지만 주간 회고까지는 읽기 어렵습니다."],
    alternatives: [
      [NotebookPen, "NotebookPen", "지난 작업을 돌아보고 적는 행동을 표현합니다."],
      [CalendarDays, "CalendarDays", "일간·주간 범위를 강조합니다. 작업·일정 아이콘과 유사합니다."],
      [History, "History", "이미 지나간 기간을 돌아보는 쪽에 초점을 둡니다."],
    ],
  },
  {
    title: "앱 관리", location: "설정 사이드바", chosen: 3,
    current: [Power, "Power", "설정을 여는 대신 앱을 끌 것처럼 보입니다."],
    alternatives: [
      [AppWindow, "AppWindow", "앱 자체의 동작을 관리하는 메뉴."],
      [Wrench, "Wrench", "유지 관리와 앱 동작 조정을 강조합니다."],
      [Settings, "Settings", "설정이라는 뜻이 익숙합니다. 바깥 설정 진입점과 의미가 겹칩니다."],
    ],
  },
  {
    title: "조사", location: "사이드바", chosen: 3,
    current: [Telescope, "Telescope", "탐색의 비유는 통하지만 조사 자료가 떠오르기까지 한 단계가 더 필요합니다."],
    alternatives: [
      [Search, "Search", "조사와 탐색을 바로 연상시킵니다."],
      [FileSearch, "FileSearch", "출처와 근거가 담긴 자료를 살펴본다는 뜻이 강합니다."],
      [Library, "Library", "등록한 자료를 모아 보는 쪽에 가깝습니다."],
    ],
  },
  {
    title: "학습", location: "사이드바", chosen: 2,
    current: [Lightbulb, "Lightbulb", "학습 기록보다 아이디어나 팁에 가깝습니다."],
    alternatives: [
      [BookOpen, "BookOpen", "학습 내용을 읽고 정리하는 메뉴."],
      [BookMarked, "BookMarked", "저장한 학습 주제를 다시 찾는 쪽을 강조합니다."],
      [GraduationCap, "GraduationCap", "교육이라는 뜻이 분명하고 수업·수료의 인상도 있습니다."],
    ],
  },
  {
    title: "기록 수집 상태 · AI 기록 가져오기 설정", location: "프로젝트 현황과 연결 결과", chosen: 0,
    current: [History, "History", "과거 이력은 읽히지만 현재 상태와 수집 설정은 구분되지 않습니다."],
    alternatives: [
      [Activity, "Activity", "수집이 어떻게 동작 중인지 확인하는 상태 진입점."],
      [CalendarClock, "CalendarClock", "수집 주기나 마지막 실행 시각을 보여 주는 쪽에 적합합니다."],
      [Settings, "Settings", "‘AI 기록 가져오기 설정’처럼 설정을 여는 버튼에 적합합니다."],
    ],
  },
  {
    title: "AI 대화 기록 가져오기", location: "프로젝트 · AI 기록 가져오기", chosen: 1,
    current: [Download, "Download", "인터넷에서 파일을 내려받는 동작처럼 보일 수 있습니다."],
    alternatives: [
      [Import, "Import", "기존 기록을 앱 안으로 가져오는 방향을 보여 줍니다."],
      [HardDriveDownload, "HardDriveDownload", "PC에 저장되는 기록이라는 점을 강조합니다."],
      [Inbox, "Inbox", "여러 도구에서 들어오는 기록을 모으는 의미가 강합니다."],
    ],
  },
  {
    title: "변경안 가져오기", location: "변경안 검토", chosen: 1,
    current: [Upload, "Upload", "로컬 파일을 여는 기능이 업로드처럼 보입니다."],
    alternatives: [
      [FileInput, "FileInput", "변경안 파일을 검토 화면으로 들여오는 동작."],
      [FolderOpen, "FolderOpen", "파일 선택 창을 열어 로컬에서 고르는 동작."],
      [FileDown, "FileDown", "문서를 가져오는 쪽은 읽히지만 다운로드로도 해석될 수 있습니다."],
    ],
  },
  {
    title: "AI 기록 수집 켜기", location: "프로젝트 · AI 기록 가져오기", chosen: 1,
    current: [Timer, "Timer", "한 번의 타이머 시작으로 읽힐 수 있습니다."],
    alternatives: [
      [Repeat2, "Repeat2", "주기적으로 반복되는 수집. ‘AI 기록 자동 수집 켜기’와 잘 맞습니다."],
      [CalendarSync, "CalendarSync", "일정에 따라 수집한다는 점을 강조합니다."],
      [DatabaseZap, "DatabaseZap", "기록 저장 자동화를 표현하지만 주기는 드러나지 않습니다."],
    ],
  },
  {
    title: "본인 작업 기록", location: "작업·일정 · 작업 카드", chosen: 0,
    current: [Play, "Play", "시작은 읽히지만 시간을 기록한다는 점이 문구에서 약합니다."],
    alternatives: [
      [Timer, "Timer", "작업 시간을 재기 시작한다는 뜻을 가장 직접적으로 표현합니다."],
      [ClockPlus, "ClockPlus", "시간을 기록하는 기능으로 읽히고 수동 추가로도 해석될 수 있습니다."],
      [CirclePlay, "CirclePlay", "‘시간 기록 시작’과 짝지으면 시작과 중지의 대비가 선명합니다."],
    ],
  },
  {
    title: "해석 수정의 근거로 선택", location: "사용 분석 · 표현 후보", chosen: 1,
    current: [Link2, "Link2", "원문을 근거로 선택하는 동작이 URL 링크 조작처럼 보입니다."],
    alternatives: [
      [ClipboardList, "ClipboardList", "해석을 뒷받침할 근거 목록에 넣는 의미."],
      [CirclePlus, "CirclePlus", "선택한 원문을 근거에 추가하는 동작을 단순하게 표현합니다."],
      [FileText, "FileText", "근거의 대상이 원문이라는 점을 강조합니다."],
    ],
  },
  {
    title: "빈 상태와 프로젝트 연결 안내", location: "공통 빈 상태", chosen: 1,
    current: [Sparkles, "Sparkles", "비어 있는 이유보다 AI 기능이 있다는 인상을 줍니다."],
    alternatives: [
      [Inbox, "Inbox", "표시할 문서나 기록이 비어 있는 경우."],
      [FolderOpen, "FolderOpen", "연결된 프로젝트가 없거나 폴더에 문서가 없는 경우."],
      [Info, "Info", "다음에 할 일을 설명하는 안내형 빈 상태."],
    ],
  },
  {
    title: "선택된 메뉴 표시", location: "펼친 사이드바", chosen: null,
    current: [ChevronRight, "ChevronRight", "선택된 메뉴에 하위 화면이 더 있는 것처럼 보입니다."],
    alternatives: [
      [Dot, "Dot", "작은 점으로 현재 메뉴를 표시합니다. 강조 배경과 굵은 글자만으로도 구분할 수 있습니다."],
      [CircleDot, "CircleDot", "현재 선택된 항목을 작은 점으로 표시합니다."],
      [Minus, "Minus", "방향성이 없는 짧은 선. 메뉴를 접는 동작으로 읽힐 여지가 있습니다."],
    ],
  },
  {
    title: "AI 도구 스킬 업데이트", location: "설정 · AI 도구", chosen: 1,
    current: [RefreshCw, "RefreshCw", "연결 상태 새로고침과 스킬 파일 변경을 구분하기 어렵습니다."],
    alternatives: [
      [PackagePlus, "PackagePlus", "새 스킬 항목을 포함한 패키지를 적용하는 동작."],
      [ArrowDownToLine, "ArrowDownToLine", "로컬에 업데이트를 반영하는 인상이 있지만 다운로드와 비슷합니다."],
      [Wrench, "Wrench", "도구 구성을 손보는 행동을 나타냅니다."],
    ],
  },
];

export default function IconAlternatives() {
  return <div className="system-stack">
    <p className="muted">{comparisons.length}개 항목의 교체 전 아이콘과 대안입니다. 앱에 적용한 선택에는 ‘반영됨’, 기존 아이콘을 계속 쓰는 경우에는 ‘유지’를 표시합니다.</p>
    {comparisons.map(({ title, location, current, alternatives, chosen }, index) => <section
      className="panel system-section"
      key={title}
      aria-labelledby={`icon-comparison-${index}`}
    >
      <div>
        <span className="micro">{location}</span>
        <h2 id={`icon-comparison-${index}`}>{index + 1}. {title}</h2>
        {chosen === null && <p className="muted">강조 배경·강조 글자·굵기로 표시합니다.</p>}
      </div>
      <ul className="system-icon-grid system-icon-comparison">
        {[current, ...alternatives].map(([Icon, name, description], option) => <li className="system-icon-tile" key={name} data-adopted={chosen === option || undefined}>
          <span className="micro">{option === 0 ? (chosen === 0 ? "기존 · 유지" : "교체 전") : `대안 ${option}${chosen === option ? " · 반영됨" : ""}`}</span>
          <span className="system-icon-comparison-symbol" aria-hidden="true"><Icon size={18} /></span>
          <code>{name}</code>
          <span>{description}</span>
        </li>)}
      </ul>
    </section>)}
  </div>;
}
