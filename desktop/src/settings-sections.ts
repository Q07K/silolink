import { Bell, Bot, HardDrive, Palette, ScanSearch, Settings } from "lucide-react";

export const settingsSections = [
  { id: "tools", label: "AI 도구", description: "사용 중인 AI 도구에 SiloLink를 연결합니다.", icon: Bot },
  { id: "appearance", label: "화면", description: "작업 공간의 밝기와 테마를 설정합니다.", icon: Palette },
  { id: "collection", label: "기록·수집", description: "기록 저장 위치와 자동 수집 방식을 설정합니다.", icon: HardDrive },
  { id: "detection", label: "요청 감지", description: "넓게 맡긴 요청을 찾을 때 쓰는 표현을 고칩니다.", icon: ScanSearch },
  { id: "review", label: "알림·회고", description: "알림과 하루·주간 회고의 기준을 설정합니다.", icon: Bell },
  { id: "app", label: "앱 관리", description: "앱의 백그라운드 동작과 종료를 확인합니다.", icon: Settings },
] as const;

export function getSettingsSection(id: string) {
  return settingsSections.find((section) => section.id === id) ?? settingsSections[0];
}
