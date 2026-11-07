// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Badge, Button, Dialog, Field, Toast } from "./components";

afterEach(cleanup);

it("기존 버튼 클래스는 그대로 두고 위험 동작을 별도 클래스로 표시한다", () => {
  render(<>
    <Button>보조</Button>
    <Button primary>주요</Button>
    <Button quiet>조용한</Button>
    <Button danger>삭제</Button>
    <Button primary danger>영구 삭제</Button>
  </>);
  expect(screen.getByRole("button", { name: "보조" }).className).toBe("button");
  expect(screen.getByRole("button", { name: "주요" }).className).toBe("button primary");
  expect(screen.getByRole("button", { name: "조용한" }).className).toBe("button quiet");
  expect(screen.getByRole("button", { name: "삭제" }).className).toBe("button danger");
  expect(screen.getByRole("button", { name: "영구 삭제" }).className).toBe("button primary danger");
});

it("처리 중인 버튼은 다시 누를 수 없고 보조 기술에 진행 상태를 알린다", () => {
  const click = vi.fn();
  render(<Button primary loading onClick={click}>저장</Button>);
  const button = screen.getByRole("button", { name: "저장" });
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(button).toHaveProperty("disabled", true);
  expect(button.querySelector("svg.spin")).toBeTruthy();
  fireEvent.click(button);
  expect(click).not.toHaveBeenCalled();
});

it("배지는 상태 이름을 클래스로 표시한다", () => {
  render(<>
    <Badge>기본</Badge>
    <Badge accent>강조</Badge>
    <Badge tone="success">성공</Badge>
    <Badge tone="warning">주의</Badge>
    <Badge tone="danger">실패</Badge>
  </>);
  expect(screen.getByText("기본").className).toBe("badge");
  expect(screen.getByText("강조").className).toBe("badge accent");
  expect(screen.getByText("성공").className).toBe("badge success");
  expect(screen.getByText("주의").className).toBe("badge warning");
  expect(screen.getByText("실패").className).toBe("badge danger");
});

it("입력 도움말과 오류는 레이블 이름에 섞이지 않고 입력의 설명으로 연결된다", () => {
  render(<>
    <Field label="문서 이름"><input /></Field>
    <Field label="문서 경로" hint="프로젝트 안의 상대 경로" error="프로젝트 밖의 경로입니다"><input /></Field>
  </>);
  const plain = screen.getByRole("textbox", { name: "문서 이름" });
  expect(plain.closest("label.form-field")).toBeTruthy();
  expect(plain.getAttribute("aria-describedby")).toBeNull();
  const path = screen.getByRole("textbox", { name: "문서 경로" });
  expect(path.closest(".form-field")).toBeTruthy();
  expect(path.getAttribute("aria-invalid")).toBe("true");
  const described = path.getAttribute("aria-describedby")!.split(" ").map((id) => document.getElementById(id)?.textContent);
  expect(described).toEqual(["프로젝트 안의 상대 경로", "프로젝트 밖의 경로입니다"]);
});

it("토스트는 오류를 즉시 알리고 닫기를 제공한다", () => {
  const close = vi.fn();
  render(<>
    <Toast title="저장했습니다" />
    <Toast tone="danger" title="저장하지 못했습니다" onClose={close}>쓰기 권한을 확인하세요.</Toast>
  </>);
  expect(screen.getByRole("status").textContent).toContain("저장했습니다");
  expect(screen.getByRole("alert").textContent).toContain("쓰기 권한을 확인하세요.");
  fireEvent.click(screen.getByRole("button", { name: "알림 닫기" }));
  expect(close).toHaveBeenCalledOnce();
});

it("정해진 시간이 지나면 토스트가 스스로 닫힌다", () => {
  vi.useFakeTimers();
  const close = vi.fn();
  render(<Toast title="복사했습니다" duration={3000} onClose={close} />);
  vi.advanceTimersByTime(2999);
  expect(close).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(close).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

it("대화상자를 닫으면 연 버튼으로 포커스를 돌려준다", () => {
  function Host({ open }: { open: boolean }) {
    return <><button type="button">열기</button><Dialog open={open} title="확인" onClose={() => undefined} /></>;
  }
  const { rerender } = render(<Host open={false} />);
  const opener = screen.getByRole("button", { name: "열기" });
  opener.focus();
  rerender(<Host open />);
  screen.getByRole("button", { name: "대화상자 닫기" }).focus();
  rerender(<Host open={false} />);
  expect(document.activeElement).toBe(opener);
});

it("대화상자는 제목으로 이름이 붙고 Escape나 닫기로 닫힌다", () => {
  const close = vi.fn();
  const { rerender } = render(
    <Dialog open={false} title="변경을 버릴까요?" onClose={close}>작성한 내용이 사라집니다.</Dialog>,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  rerender(
    <Dialog open title="변경을 버릴까요?" description="작성한 내용이 사라집니다." onClose={close}
      actions={<Button primary danger>버리기</Button>}>본문</Dialog>,
  );
  const dialog = screen.getByRole("dialog", { name: "변경을 버릴까요?" });
  expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
  expect(screen.getByRole("button", { name: "버리기" }).closest(".form-actions")).toBeTruthy();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(close).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "대화상자 닫기" }));
  expect(close).toHaveBeenCalledTimes(2);
});
