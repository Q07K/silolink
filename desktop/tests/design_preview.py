"""Verify the local design-only Vite server with Edge; requires npm run design."""
from pathlib import Path
import json
import uuid
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.tools' / 'design-preview' / str(uuid.uuid4())
OUT.mkdir(parents=True)
errors = []
menu_icons = {
    '요약': 'layout-dashboard',
    '일간·주간 회고': 'notebook-pen',
    '사용 분석': 'file-search',
    '조사': 'library',
    '학습': 'book-marked',
    '프로젝트': 'folders',
}


def expect_footer_action(button, icon=None):
    footer = button.locator('..')
    expect(footer).to_have_class('form-actions')
    expect(footer).to_have_css('justify-content', 'flex-end')
    end, container = footer.get_by_role('button').last.bounding_box(), footer.bounding_box()
    assert abs(end['x'] + end['width'] - container['x'] - container['width']) <= 1
    if icon:
        expect(button.locator('svg')).to_have_count(1)
        expect(button.locator(f'svg.lucide-{icon}')).to_have_attribute('aria-hidden', 'true')


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', headless=True)
    page = browser.new_page(viewport={'width': 1320, 'height': 940})
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto('http://127.0.0.1:7431/', wait_until='networkidle')
        assert page.url.endswith('/design.html')
        expect(page.get_by_role('region', name='디자인 미리보기')).to_contain_text('예시 데이터')
        for theme in ['light', 'dark']:
            page.get_by_role('combobox', name='미리보기 테마', exact=True).select_option(theme)
            for label in ['요약', '대화', '작업·일정', '일간·주간 회고', '기록·문서', '사용 분석', '조사', '학습', '프로젝트', '변경안 검토']:
                menu = page.get_by_role('navigation', name='주요 탐색').get_by_role('button', name=label, exact=True)
                menu.click()
                expect(menu).to_have_attribute('aria-current', 'page')
                if label in menu_icons:
                    expect(menu.locator(f'svg.lucide-{menu_icons[label]}')).to_be_visible()
                expect(menu.locator('svg')).to_have_count(1)
                assert page.evaluate('document.documentElement.dataset.theme') == theme
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                group = '내 작업' if label in ['요약', '대화', '작업·일정', '일간·주간 회고'] else '프로젝트 실행' if label in ['프로젝트', '변경안 검토'] else '지식 탐색'
                location = page.get_by_role('navigation', name='현재 위치')
                expect(location.get_by_role('button', name=group, exact=True)).to_be_visible()
                expect(location.locator('[aria-current="page"]')).to_have_text(label)
                for element in [location.get_by_role('button'), location.locator('[aria-current="page"]'), menu, page.get_by_role('combobox', name='현재 프로젝트', exact=True)]:
                    expect(element).to_have_css('font-size', '14px')
                expect(page.locator('.page h1').first).to_have_css('font-size', '28px')
                expect(page.locator('.page')).to_have_css('padding-left', '32px')
                assert abs(location.bounding_box()['x'] - page.locator('.page').bounding_box()['x'] - 32) <= 1
                for button in page.locator('.page .button').all():
                    expect(button).to_have_css('font-size', '14px')
                    if button.is_visible():
                        assert button.bounding_box()['height'] >= 40
                spacing_violations = page.locator('.page, .panel, .heading, .section-heading, .tabs, .form-actions, .compose, .list-row, .note-row').evaluate_all('''elements => elements.flatMap(el => {
                    const style = getComputedStyle(el);
                    return ['paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginBottom','rowGap','columnGap'].flatMap(property => {
                        const value = parseFloat(style[property]);
                        return Number.isFinite(value) && value % 8 !== 0 ? [`${el.className}.${property}=${value}`] : [];
                    });
                })''')
                assert not spacing_violations, spacing_violations
            # Change editor fields need layout checks inside the panel, beyond its outer spacing.
            expect(page.get_by_role('button', name='변경안 가져오기', exact=True).locator('svg.lucide-file-input')).to_be_visible()
            form = page.get_by_role('form', name='변경안 작성')
            reason = form.get_by_role('textbox', name='정리 이유', exact=True)
            source = form.locator('.change-source')
            assert reason.locator('..').bounding_box()['y'] - source.bounding_box()['y'] - source.bounding_box()['height'] >= 24
            for field in form.locator('.form-field').all():
                caption = field.locator('span').first.bounding_box()
                control = field.locator('input, select, textarea').bounding_box()
                assert abs(control['y'] - caption['y'] - caption['height'] - 8) <= 1
            inspect = form.get_by_role('button', name='이전·이후와 영향 검토', exact=True)
            actions = inspect.locator('..').bounding_box()
            assert abs(inspect.bounding_box()['x'] + inspect.bounding_box()['width'] - actions['x'] - actions['width']) <= 1
            page.screenshot(path=str(OUT / f'change-form-{theme}.png'))
            form.get_by_role('combobox', name='수정할 문서', exact=True).select_option(index=1)
            form.get_by_role('button', name='내용 불러오기', exact=True).click()
            expect(form.get_by_role('textbox', name='변경 후 본문', exact=True)).to_be_visible()
            page.screenshot(path=str(OUT / f'change-edit-{theme}.png'))
            form.get_by_role('button', name='새 문서', exact=True).click()
            form.get_by_role('textbox', name='새 문서 경로', exact=True).fill('docs/new.md')
            form.get_by_role('textbox', name='변경 후 본문', exact=True).fill('# 새 문서')
            form.get_by_role('button', name='변경 목록에 추가', exact=True).click()
            expect(page.get_by_role('region', name='검토할 변경')).to_contain_text('docs/new.md')
            page.get_by_role('button', name='고급 · JSON 직접 입력', exact=True).click()
            json_field = form.get_by_role('textbox', name='문서 변경안 JSON', exact=True)
            expect(json_field).to_be_visible()
            advanced_inspect = form.get_by_role('button', name='원문·영향 검사', exact=True)
            assert advanced_inspect.evaluate('(el)=>!!el.closest(".form-actions")')
            page.screenshot(path=str(OUT / f'change-json-{theme}.png'))
            page.locator('.sidebar-bottom').get_by_role('button', name='설정', exact=True).click()
            expect(page.get_by_role('region', name='Codex', exact=True)).to_contain_text('연결됨')
            for tool in ['Codex', 'Claude Code', 'Antigravity']:
                logo = page.get_by_role('heading', name=tool, exact=True).locator('img')
                expect(logo).to_be_visible()
                expect(logo).to_have_js_property('complete', True)
                assert logo.evaluate('(image) => image.naturalWidth > 0')
                expected_filter = 'invert(1)' if tool == 'Codex' and theme == 'light' else 'none'
                expect(logo).to_have_css('filter', expected_filter)
            expect(page.get_by_role('region', name='Antigravity', exact=True).get_by_role('button', name='연결', exact=True)).to_be_visible()
            categories = page.get_by_role('navigation', name='설정 분류')
            expect(categories.get_by_role('button', name='앱 관리', exact=True).locator('svg.lucide-settings')).to_be_visible()
            assert categories.evaluate('(el)=>!!el.closest("#app-navigation")')
            expect(page.get_by_role('main').get_by_role('navigation', name='설정 분류')).to_have_count(0)
            expect(page.get_by_role('navigation', name='주요 탐색')).to_have_count(0)
            expect(page.get_by_text('개인 지식 작업 공간', exact=True)).to_have_count(0)
            for category in ['화면', '기록·수집', '알림·회고', '앱 관리', 'AI 도구']:
                categories.get_by_role('button', name=category, exact=True).click()
                expect(categories.get_by_role('button', name=category, exact=True)).to_have_attribute('aria-current', 'page')
                expect(page.get_by_role('heading', name=category, level=1, exact=True)).to_be_visible()
                if category in ['화면', '알림·회고']:
                    settings_form = page.locator('#workspace-content form')
                    expect(settings_form.locator('.form-row').last).to_have_css('border-bottom-width', '0px')
                    expect(settings_form.locator('.form-actions')).to_have_css('border-top-width', '1px')
                    if category == '알림·회고':
                        expect(settings_form.locator('.form-row').nth(1)).to_have_css('border-top-width', '1px')
            page.screenshot(path=str(OUT / f'settings-sidebar-{theme}.png'))
            assert page.locator('.titlebar-meta, .app-footer').count() == 0
            assert page.locator('.titlebar .contextbar').count() == 1
            assert page.locator('.titlebar').bounding_box()['height'] == 64
            page.get_by_role('button', name='사이드바 접기', exact=True).click()
            assert page.locator('.sidebar').bounding_box()['width'] == 72
            categories.get_by_role('button', name='화면', exact=True).hover()
            expect(page.get_by_role('tooltip')).to_have_text('화면')
            categories.get_by_role('button', name='화면', exact=True).click()
            expect(page.get_by_role('combobox', name='화면 테마', exact=True)).to_be_visible()
            expect(page.get_by_role('tooltip')).to_have_count(0)
            page.screenshot(path=str(OUT / f'settings-sidebar-folded-{theme}.png'))
            page.get_by_role('button', name='작업 공간으로', exact=True).click()
            expect(categories).to_have_count(0)
            expect(page.get_by_role('navigation', name='주요 탐색').get_by_role('button', name='변경안 검토', exact=True)).to_have_attribute('aria-current', 'page')
            assert page.locator('.sidebar').bounding_box()['width'] == 72
            folded_home = page.get_by_role('navigation', name='주요 탐색').get_by_role('button', name='요약', exact=True)
            expect(folded_home.locator('svg.lucide-layout-dashboard')).to_be_visible()
            docs_menu = page.get_by_role('navigation', name='주요 탐색').get_by_role('button', name='기록·문서', exact=True)
            docs_menu.hover()
            expect(page.get_by_role('tooltip')).to_have_text('기록·문서')
            page.screenshot(path=str(OUT / f'folded-tooltip-{theme}.png'))
            page.mouse.move(800, 150)
            docs_menu.focus()
            expect(page.get_by_role('tooltip')).to_have_text('기록·문서')
            page.keyboard.press('Escape')
            expect(page.get_by_role('tooltip')).to_have_count(0)
            docs_menu.click()
            expect(page.get_by_role('tooltip')).to_have_count(0)
            page.get_by_role('combobox', name='현재 프로젝트', exact=True).select_option('design-portfolio')
            expect(page.get_by_role('heading', name='개인 포트폴리오 프로젝트 소개', exact=True)).to_be_visible()
            page.get_by_role('combobox', name='현재 프로젝트', exact=True).select_option('design-silolink')
            page.get_by_role('button', name='사이드바 펼치기', exact=True).click()
            toggle = page.get_by_role('button', name='사이드바 접기', exact=True)
            assert toggle.evaluate('(el)=>!!el.closest(".sidebar-controls")')
            toggle_box, sidebar_box = toggle.bounding_box(), page.locator('.sidebar').bounding_box()
            assert toggle_box['x'] >= sidebar_box['x'] and toggle_box['x'] + toggle_box['width'] <= sidebar_box['x'] + sidebar_box['width']
            workspace_before = page.get_by_role('main').bounding_box()
            bell = page.get_by_role('button', name='알림', exact=True)
            bell.click()
            popup = page.get_by_role('dialog', name='알림', exact=True)
            expect(popup).to_be_visible()
            popup_box, bell_box = popup.bounding_box(), bell.bounding_box()
            assert popup_box['y'] >= bell_box['y'] + bell_box['height']
            assert abs(popup_box['x'] + popup_box['width'] - bell_box['x'] - bell_box['width']) <= 2
            assert page.get_by_role('main').bounding_box() == workspace_before
            page.screenshot(path=str(OUT / f'notifications-{theme}.png'))
            page.keyboard.press('Escape')
            expect(popup).to_have_count(0)
            expect(bell).to_be_focused()
            bell.click()
            page.get_by_role('main').click(position={'x': 20, 'y': 20})
            expect(popup).to_have_count(0)
        nav = page.get_by_role('navigation', name='주요 탐색')
        # Tokens remain stable in the compact sidebar and narrower desktop windows.
        for width in [1448, 1040, 960]:
            page.set_viewport_size({'width': width, 'height': 940})
            if page.get_by_role('button', name='사이드바 접기', exact=True).count():
                page.get_by_role('button', name='사이드바 접기', exact=True).click()
            for menu in ['요약', '대화', '조사', '학습']:
                nav.get_by_role('button', name=menu, exact=True).click()
                gutter = '32px' if width > 1150 else '24px'
                expect(page.locator('.page')).to_have_css('padding-left', gutter)
                for element in page.locator('.context-location button, .context-location strong').all():
                    expect(element).to_have_css('font-size', '14px')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                if width == 1448:
                    page.screenshot(path=str(OUT / f'system-{menu}.png'))
        page.set_viewport_size({'width': 1320, 'height': 940})
        page.get_by_role('button', name='사이드바 펼치기', exact=True).click()
        for menu, label in [('작업·일정', '작업 보기'), ('일간·주간 회고', '회고 기간'), ('기록·문서', '문서 보기'), ('사용 분석', '사용 분석 보기'), ('조사', '조사 보기'), ('프로젝트', '프로젝트 보기')]:
            nav.get_by_role('button', name=menu, exact=True).click()
            tablist = page.get_by_role('tablist', name=label)
            tabs = tablist.get_by_role('tab')
            assert all(tab.bounding_box()['height'] >= 44 for tab in tabs.all())
            tabs.first.focus()
            page.keyboard.press('End')
            expect(tabs.last).to_have_attribute('aria-selected', 'true')
            panel = page.get_by_role('tabpanel')
            assert tabs.last.get_attribute('aria-controls') == panel.get_attribute('id')
            if menu == '작업·일정':
                plan = page.get_by_role('button', name='계획 작성', exact=True)
                action_box, plan_box = page.locator('.form-actions').bounding_box(), plan.bounding_box()
                assert abs(action_box['x'] + action_box['width'] - plan_box['x'] - plan_box['width']) <= 1
                page.screenshot(path=str(OUT / 'planning-actions.png'))
            page.keyboard.press('Home')
            expect(tabs.first).to_have_attribute('aria-selected', 'true')
        nav.get_by_role('button', name='조사', exact=True).click()
        page.screenshot(path=str(OUT / 'research-list.png'))
        page.get_by_role('tab', name='조사 노트', exact=True).click()
        expect(page.get_by_role('region', name='노트 내보내기')).to_have_count(0)
        expect(page.get_by_role('checkbox')).to_have_count(0)
        nav.get_by_role('button', name='사용 분석', exact=True).click()
        repeated = page.get_by_role('tabpanel', name='반복 요청', exact=True)
        expect(repeated.get_by_role('button', name='선택한 기록 0개 분석')).to_be_disabled()
        repeated.get_by_role('checkbox').first.check()
        repeated.get_by_role('button', name='선택한 기록 1개 분석').click()
        expect(page.get_by_role('textbox', name='질문 입력', exact=True)).to_have_value(
            '선택한 자료에서 자주 요청한 주제·모호한 용어·다른 프로젝트에도 고려할 내용을 근거와 함께 분석해줘.'
        )
        nav.get_by_role('button', name='학습', exact=True).click()
        expect(page.get_by_role('textbox')).to_have_count(0)
        expect(page.get_by_role('checkbox')).to_have_count(0)
        page.screenshot(path=str(OUT / 'learning-list.png'))
        page.get_by_role('button', name='학습 주제 추가', exact=True).click()
        expect(page.get_by_role('textbox', name='학습 주제', exact=True)).to_be_focused()
        expect_footer_action(page.get_by_role('button', name='학습 주제 저장', exact=True), 'save')
        page.screenshot(path=str(OUT / 'learning-editor.png'))
        page.get_by_role('button', name='취소', exact=True).click()
        expect(page.get_by_role('button', name='학습 주제 추가', exact=True)).to_be_focused()
        nav.get_by_role('button', name='대화', exact=True).click()
        assert abs(page.locator('.chat-workspace').bounding_box()['x'] - page.locator('.page .heading').bounding_box()['x']) <= 1
        expect(page.get_by_role('textbox', name='질문 입력', exact=True)).to_be_in_viewport()
        expect(page.get_by_role('region', name='질문에 포함할 자료')).to_have_count(0)
        page.get_by_role('button', name='문서 요약 질문 작성', exact=True).click()
        assert '요약' in page.get_by_role('textbox', name='질문 입력', exact=True).input_value()
        page.screenshot(path=str(OUT / 'chat-question-first.png'))
        page.get_by_role('button', name='자료 선택', exact=True).click()
        expect(page.get_by_role('region', name='질문에 포함할 자료')).to_be_visible()
        page.get_by_role('button', name='자료 선택', exact=True).click()
        page.get_by_role('navigation', name='현재 위치').get_by_role('button', name='내 작업', exact=True).click()
        expect(page.get_by_role('table', name='연결한 프로젝트')).to_be_visible()
        nav.get_by_role('button', name='기록·문서', exact=True).click()
        page.get_by_role('button', name='읽기', exact=True).first.click()
        expect(page.get_by_role('heading', name='SiloLink 프로젝트 소개', exact=True)).to_be_visible()
        page.locator('.markdown').get_by_role('button', name='화면 검토 기준', exact=True).click()
        expect(page.locator('.markdown').get_by_role('heading', name='화면 검토 기준', exact=True)).to_be_visible()
        page.get_by_role('navigation', name='현재 위치').get_by_role('button', name='기록·문서', exact=True).click()
        expect(page.get_by_role('button', name='읽기', exact=True)).to_have_count(2)
        page.get_by_role('combobox', name='현재 프로젝트', exact=True).select_option('design-portfolio')
        nav.get_by_role('button', name='기록·문서', exact=True).click()
        expect(page.get_by_role('heading', name='개인 포트폴리오 프로젝트 소개', exact=True)).to_be_visible()
        page.get_by_role('combobox', name='현재 프로젝트', exact=True).select_option('design-silolink')
        nav.get_by_role('button', name='요약', exact=True).click()
        task = page.locator('.agenda').get_by_role('checkbox').first
        heading = page.get_by_role('heading', name='전체 프로젝트', exact=True)
        before_notice = heading.bounding_box()
        task.click()
        toolbar = page.get_by_role('region', name='디자인 미리보기')
        expect(toolbar.get_by_role('status')).to_have_text('저장·수집·AI 실행은 데스크톱 앱에서 사용할 수 있습니다.')
        expect(page.get_by_role('alert')).to_have_count(0)
        expect(task).not_to_be_checked()
        assert heading.bounding_box() == before_notice
        toolbar.get_by_role('button', name='미리보기 안내 닫기').click()
        expect(toolbar.get_by_role('status')).to_be_empty()
        page.get_by_role('combobox', name='미리보기 화면 상태', exact=True).select_option('empty')
        expect(page.get_by_role('heading', name='프로젝트가 없습니다', exact=True)).to_be_visible()
        page.screenshot(path=str(OUT / 'first-use.png'))
        nav.get_by_role('button', name='대화', exact=True).click()
        expect(page.get_by_role('main').locator('.empty-symbol > svg.lucide-inbox')).to_be_visible()
        page.get_by_role('combobox', name='미리보기 화면 상태', exact=True).select_option('populated')
        page.get_by_role('combobox', name='미리보기 테마', exact=True).select_option('light')
        expect(page.get_by_role('table', name='연결한 프로젝트')).to_be_visible()
        page.screenshot(path=str(OUT / 'design-review.png'))
        nav.get_by_role('button', name='작업·일정', exact=True).click()
        expect_footer_action(page.get_by_role('button', name='작업 추가', exact=True), 'plus')
        expect_footer_action(page.get_by_role('button', name='본인 작업 기록', exact=True).first, 'play')
        expect_footer_action(page.get_by_role('button', name='작업 완료', exact=True).first, 'check')
        expect_footer_action(page.get_by_role('button', name='사용자 확인 기록', exact=True).first, 'clipboard-check')
        nav.get_by_role('button', name='기록·문서', exact=True).click()
        page.get_by_role('tab', name='도구별 기록', exact=True).click()
        expect_footer_action(page.get_by_role('button', name='이 맥락으로 질문', exact=True).first, 'message-circle')
        nav.get_by_role('button', name='사용 분석', exact=True).click()
        page.get_by_role('tab', name='표현 후보', exact=True).click()
        expect_footer_action(page.get_by_role('button', name='개념과 요청을 함께 다듬기', exact=True).first, 'message-circle')
        expect_footer_action(page.get_by_role('button', name='해석 수정의 근거로 선택', exact=True).first, 'clipboard-list')
        nav.get_by_role('button', name='프로젝트', exact=True).click()
        expect_footer_action(page.get_by_role('button', name='작업·완료 기준 확인', exact=True), 'list-checks')
        expect_footer_action(page.get_by_role('button', name='기록 수집 상태', exact=True), 'history')
        page.get_by_role('tab', name='공통·로컬 규칙', exact=True).click()
        expect_footer_action(page.get_by_role('button', name='변경안 검토·적용', exact=True), 'git-compare-arrows')
        page.get_by_role('tab', name='합치기·분리하기', exact=True).click()
        expect_footer_action(page.get_by_role('button', name='관련 프로젝트를 선택해 비교', exact=True), 'message-circle')
        page.get_by_role('tab', name='AI 기록 가져오기', exact=True).click()
        expect_footer_action(page.get_by_role('button', name='AI 대화 기록 가져오기', exact=True), 'import')
        expect_footer_action(page.get_by_role('button', name='AI 기록 수집 켜기', exact=True), 'repeat-2')
        # The ordinary app build still refuses browser access instead of showing fixtures.
        response = page.request.get('http://127.0.0.1:7431/src/api.ts')
        assert 'DESKTOP_REQUIRED' in response.text()
        assert 'createPreviewSnapshot' not in response.text()
        page.get_by_role('link', name='디자인 시스템', exact=True).click()
        assert page.url.endswith('/design-system.html')
        expect(page.get_by_role('heading', name='디자인 시스템', level=1, exact=True)).to_be_visible()
        expect(page.get_by_role('region', name='간격과 크기')).to_contain_text('8px')
        page.screenshot(path=str(OUT / 'system-foundations.png'), full_page=True)
        catalog = page.get_by_role('tablist', name='디자인 시스템 분류')
        catalog.get_by_role('tab', name='아이콘 대안', exact=True).click()
        comparisons = page.get_by_role('tabpanel', name='아이콘 대안', exact=True)
        expect(comparisons.locator('[data-adopted]')).to_have_count(15)
        expect(comparisons.get_by_text('강조 배경·강조 글자·굵기로 표시합니다.', exact=True)).to_be_visible()
        expect(comparisons.get_by_text('기존 · 유지', exact=True)).to_have_count(2)
        catalog.get_by_role('tab', name='기본 기준', exact=True).click()
        catalog.get_by_role('tab', name='기본 기준', exact=True).focus()
        page.keyboard.press('ArrowRight')
        expect(catalog.get_by_role('tab', name='공통 요소', exact=True)).to_have_attribute('aria-selected', 'true')
        page.get_by_label('문서 이름', exact=True).fill('코멘트 초안')
        form_sample = page.get_by_role('region', name='입력과 실행 예시')
        expect(form_sample.locator('.form-actions')).to_have_css('justify-content', 'flex-end')
        form_sample.get_by_label('하단 버튼 정렬').select_option('start')
        expect(form_sample.locator('.form-actions')).to_have_css('justify-content', 'flex-start')
        form_sample.get_by_label('하단 버튼 정렬').select_option('end')
        expect(form_sample.get_by_label('문서 이름', exact=True)).to_have_value('코멘트 초안')
        page.get_by_role('button', name='예시 저장', exact=True).click()
        expect(page.get_by_role('status')).to_contain_text('실제 파일은 바뀌지 않습니다')
        page.get_by_role('combobox', name='테마', exact=True).select_option('dark')
        assert page.evaluate('document.documentElement.dataset.theme') == 'dark'
        page.screenshot(path=str(OUT / 'system-controls-dark.png'), full_page=True)
        catalog.get_by_role('tab', name='화면 패턴', exact=True).click()
        sample = page.get_by_role('region', name='사이드바 예시')
        sample.get_by_role('button', name='설정', exact=True).click()
        expect(sample.locator('nav [aria-current="page"]')).to_be_focused()
        sample.get_by_role('button', name='예시 사이드바 접기', exact=True).click()
        settings_sample = sample.get_by_role('navigation', name='예시 설정 메뉴')
        settings_sample.get_by_role('button', name='화면', exact=True).hover()
        expect(page.get_by_role('tooltip')).to_have_text('화면')
        settings_sample.get_by_role('button', name='화면', exact=True).click()
        expect(sample.get_by_role('heading', name='화면', exact=True)).to_be_visible()
        sample.get_by_role('button', name='작업 공간으로', exact=True).click()
        expect(sample.get_by_role('navigation', name='예시 작업 메뉴')).to_be_visible()
        expect(sample.get_by_role('button', name='설정', exact=True)).to_be_focused()
        row = page.get_by_role('button', name='화면 검토 기준 조사 노트 · 오늘 원문 확인 필요', exact=True)
        row.press('Enter')
        expect(row).to_have_attribute('aria-expanded', 'true')
        expect(page.get_by_text('먼저 상태를 읽고 필요한 상세를 엽니다.', exact=True)).to_be_visible()
        empty_sample = page.get_by_role('region', name='빈 상태 제안')
        empty_sample.get_by_role('button', name='자료 추가').click()
        name = empty_sample.get_by_label('자료 이름')
        expect(name).to_be_focused()
        empty_sample.get_by_role('button', name='취소').click()
        expect(empty_sample.get_by_role('button', name='자료 추가')).to_be_focused()
        empty_sample.get_by_role('button', name='자료 추가').click()
        name.fill('검토할 첫 자료')
        empty_sample.get_by_role('button', name='자료 저장').click()
        expect(empty_sample.get_by_role('status')).to_have_text('예시 자료를 추가했습니다')
        expect(empty_sample.get_by_text('검토할 첫 자료', exact=True)).to_be_visible()
        for width in [960, 520]:
            page.set_viewport_size({'width': width, 'height': 940})
            for tab in ['기본 기준', '공통 요소', '상태', '토큰', '화면 패턴', 'UX 검토']:
                catalog.get_by_role('tab', name=tab, exact=True).click()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, tab)
        expect(page.get_by_role('tabpanel', name='UX 검토')).to_contain_text('수치로 확인할 때')
        page.get_by_role('link', name='앱 미리보기', exact=True).click()
        expect(page.get_by_role('heading', name='전체 프로젝트', exact=True)).to_be_visible()
    except Exception:
        page.screenshot(path=str(OUT / 'failure.png'))
        raise
    finally:
        browser.close()

assert not errors, errors
(OUT / 'result.json').write_text(json.dumps({'errors': errors, 'output': str(OUT)}, indent=2), encoding='utf-8')
print(json.dumps({'passed': True, 'errors': errors, 'output': str(OUT)}))
