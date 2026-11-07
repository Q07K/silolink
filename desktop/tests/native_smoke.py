"""Exercise the built WebView2 app and real Rust IPC in an isolated profile.

Requires Python + Playwright; no external browser install or live model is used.
Build the custom-protocol desktop and its provider fixture before running this.
"""
from pathlib import Path
import argparse
import ctypes
import hashlib
import json
import os
import socket
import subprocess
import time
import urllib.request
import uuid
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--executable', type=Path, default=ROOT / 'target' / 'debug' / 'silolink-desktop.exe')
EXE = parser.parse_args().executable.resolve(strict=True)
OUT = ROOT / '.tools' / 'desktop-smoke' / str(uuid.uuid4())
OUT.mkdir(parents=True)
PROJECT = OUT / '검증 프로젝트'
PROJECT.mkdir()
ORIGINAL = '# Native desktop verification\r\n\r\n[Related document](guide.md)\r\n\r\nOriginal content.\r\n'
(PROJECT / 'README.md').write_bytes(ORIGINAL.encode('utf-8'))
(PROJECT / 'guide.md').write_bytes((ROOT / 'desktop/tests/fixtures/markdown.md').read_bytes())
PROFILE = OUT / 'desktop-profile'
STATE = PROFILE / 'Data'
TOOL_HOME = OUT / 'tool-user'
TOOL_HOME.mkdir()
LEGACY_SKILL = TOOL_HOME / '.agents/skills/silolink'
LEGACY_SKILL.mkdir(parents=True)
LEGACY_BYTES = (ROOT / 'integrations/skills/silolink/SKILL.md').read_bytes()
LEGACY_METADATA = (json.dumps({'schemaVersion':2,'product':'silolink','cliPath':str((EXE.parent / 'bin/silolink.exe').resolve())},ensure_ascii=False,indent=2) + '\n').encode('utf-8')
(LEGACY_SKILL / 'SKILL.md').write_bytes(LEGACY_BYTES)
(LEGACY_SKILL / 'installation.json').write_bytes(LEGACY_METADATA)
FAKE_CLAUDE = OUT / 'fixture-claude'
(FAKE_CLAUDE / 'projects').mkdir(parents=True)
FIXTURE = ROOT / 'target' / 'debug' / 'silolink-desktop-provider-fixture.exe'
errors = []
checks = []

def invoke(page, command, args=None):
    return page.evaluate('(v)=>window.__TAURI_INTERNALS__.invoke(v.command,v.args)', {'command':command,'args':args or {}})

def launch(playwright, suffix):
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    env = dict(os.environ)
    env.update({
        'SILOLINK_DESKTOP_CONFIG_DIR':str(PROFILE),
        'SILOLINK_USER_HOME':str(TOOL_HOME),
        'SILOLINK_PROJECT_REGISTRY_DIR':str(OUT / 'shared-projects'),
        'SILOLINK_CODEX_EXECUTABLE':str(FIXTURE),
        'SILOLINK_CLAUDE_EXECUTABLE':str(FIXTURE),
        'SILOLINK_FIXTURE_PID_FILE':str(OUT / 'provider.pid'),
        'CLAUDE_CONFIG_DIR':str(FAKE_CLAUDE),
        'WEBVIEW2_USER_DATA_FOLDER':str(OUT / 'webview-profile'),
        'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS':f'--remote-debugging-port={port}',
    })
    log = (OUT / f'{suffix}.log').open('wb')
    process = subprocess.Popen([str(EXE)], cwd=OUT, env=env, stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW)
    endpoint = f'http://127.0.0.1:{port}'
    # A cold WebView2 start on a fresh CI runner can take well over the local few seconds.
    deadline = time.monotonic() + 120
    while True:
        if process.poll() is not None:
            raise AssertionError(f'Native application exited ({process.returncode}): {(OUT / (suffix+".log")).read_text(errors="replace")}')
        try:
            urllib.request.urlopen(endpoint + '/json/version', timeout=.5).close()
            break
        except OSError:
            if time.monotonic() > deadline:
                log.flush()
                raise AssertionError(f'WebView2 debugging endpoint {endpoint} did not open within 120s; app log: {(OUT / (suffix+".log")).read_text(errors="replace")}')
            time.sleep(.1)
    browser = playwright.chromium.connect_over_cdp(endpoint)
    pages = browser.contexts[0].pages
    assert pages, 'No native WebView page'
    page = pages[0]
    page.set_default_timeout(15000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.locator('.app-shell').wait_for()
    return process, browser, page, log

def wait_chat(page, status):
    for _ in range(120):
        data = invoke(page, 'workspace')['workspace']['chats']
        if data and data[-1]['status'] == status:
            return data[-1]
        time.sleep(.1)
    raise AssertionError(f'Expected chat {status}: {data[-1] if data else data}')

def process_alive(pid):
    kernel = ctypes.windll.kernel32
    handle = kernel.OpenProcess(0x1000, False, pid)
    if not handle:
        return False
    code = ctypes.c_ulong()
    try:
        return bool(kernel.GetExitCodeProcess(handle, ctypes.byref(code))) and code.value == 259
    finally:
        kernel.CloseHandle(handle)

with sync_playwright() as playwright:
    process, browser, page, log = launch(playwright, 'first-run')
    try:
        assert invoke(page, 'workspace')['workspace']['projects'] == []
        page.get_by_role('heading', name='프로젝트가 없습니다').wait_for()
        assert page.locator('.brand-icon').evaluate('(img)=>img.complete && img.naturalWidth>0 && img.src.endsWith("/branding/silolink-app-icon.png")')
        original_size = page.evaluate('({width:innerWidth,height:innerHeight})')
        for width in [1320, 1040]:
            page.set_viewport_size({'width':width,'height':800})
            for theme in ['light', 'dark']:
                page.evaluate('(theme)=>document.documentElement.dataset.theme=theme', theme)
                alignment = page.evaluate('''()=>{
                    const brand=document.querySelector('.app-brand').getBoundingClientRect();
                    const sidebar=document.querySelector('.sidebar').getBoundingClientRect();
                    const meta=document.querySelector('.titlebar .contextbar').getBoundingClientRect();
                    const icon=document.querySelector('.brand-icon').getBoundingClientRect();
                    const navIcon=document.querySelector('.sidebar nav svg').getBoundingClientRect();
                    return {brandLeft:brand.left,sidebarLeft:sidebar.left,brandRight:brand.right,
                        sidebarRight:sidebar.right,metaLeft:meta.left,iconLeft:icon.left,navLeft:navIcon.left};
                }''')
                assert abs(alignment['brandLeft'] - alignment['sidebarLeft']) < 1
                assert abs(alignment['brandRight'] - alignment['sidebarRight']) < 1
                assert abs(alignment['metaLeft'] - alignment['sidebarRight']) < 1
                assert abs(alignment['iconLeft'] - alignment['navLeft']) <= 4
                page.screenshot(path=str(OUT / f'brand-{theme}-{width}.png'))
        page.set_viewport_size(original_size)
        page.evaluate('document.documentElement.dataset.theme="system"')
        page.screenshot(path=str(OUT / 'first-run.png'))
        page.get_by_role('button', name='AI 도구 연결', exact=True).click()
        assert invoke(page, 'tool_connections')['tools'][0]['status'] == 'update_available'
        for host, label, relative in [
            ('codex', 'Codex', '.agents/skills/silolink'),
            ('claude', 'Claude Code', '.claude/skills/silolink'),
            ('antigravity', 'Antigravity', '.gemini/config/skills/silolink'),
        ]:
            button = '스킬 업데이트' if host == 'codex' else '연결'
            page.get_by_role('region', name=label, exact=True).get_by_role('button', name=button, exact=True).click()
            expect(page.get_by_role('region', name=label, exact=True)).to_contain_text('연결됨')
            tool = next(item for item in invoke(page,'tool_connections')['tools'] if item['host'] == host)
            assert len(tool['skills']) == 11 and 'silolink-init' in tool['skills']
            for name in tool['skills']:
                entry = (TOOL_HOME / relative).parent / name
                assert (entry / 'SKILL.md').is_file()
                if name != 'silolink': assert (entry / 'agents/openai.yaml').is_file()
            metadata = json.loads((TOOL_HOME / relative / 'installation.json').read_text(encoding='utf-8'))
            bundled_cli = Path(metadata['cliPath'])
            assert bundled_cli.is_file() and bundled_cli.name == 'silolink.exe'
            assert bundled_cli.resolve() == (EXE.parent / 'bin' / 'silolink.exe').resolve()
            demo = OUT / f'{host}-skill-project'
            demo.mkdir()
            (demo / 'notes.md').write_bytes(b'# Existing notes\r\n')
            for command in ['init', 'docs']:
                result = subprocess.run([str(bundled_cli), command, '--project', str(demo)], env=dict(os.environ, PATH='', SILOLINK_PROJECT_REGISTRY_DIR=str(OUT / 'tool-check-projects')), capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
                assert result.returncode == 0, result.stderr.decode('utf-8')
                if command == 'docs': assert len(json.loads(result.stdout)['documents']) == 1
            assert (demo / 'notes.md').read_bytes() == b'# Existing notes\r\n'
        assert not (PROJECT / '.silolink').exists()
        assert (LEGACY_SKILL / 'SKILL.md').read_bytes() == LEGACY_BYTES
        assert (LEGACY_SKILL / 'installation.json').read_bytes() == LEGACY_METADATA
        denied = page.evaluate('async()=>{try{await window.__TAURI_INTERNALS__.invoke("connect_tool",{host:"unknown"});return null;}catch(error){return error;}}')
        assert denied['code'] == 'INVALID_ARGUMENTS'
        assert invoke(page, 'connect_tool', {'host':'codex'})['installations'][0]['status'] == 'unchanged'
        original_skill = (TOOL_HOME / '.claude/skills/silolink/SKILL.md').read_bytes()
        (TOOL_HOME / '.claude/skills/silolink/SKILL.md').write_text('my own skill', encoding='utf-8')
        page.get_by_role('button', name='연결 상태 다시 확인', exact=True).click()
        expect(page.get_by_role('region', name='Claude Code', exact=True)).to_contain_text('기존 스킬 확인 필요')
        rejected = invoke(page, 'connect_tool', {'host':'claude'})
        assert rejected['status'] == 'failed'
        assert (TOOL_HOME / '.claude/skills/silolink/SKILL.md').read_text(encoding='utf-8') == 'my own skill'
        (TOOL_HOME / '.claude/skills/silolink/SKILL.md').write_bytes(original_skill)
        page.get_by_role('button', name='연결 상태 다시 확인', exact=True).click()
        expect(page.get_by_role('region', name='Claude Code', exact=True)).to_contain_text('연결됨')
        page.screenshot(path=str(OUT / 'tool-connections.png'))
        checks.append('real app registers three user skills using its bundled CLI, empty-PATH init/docs, reentry and edited-skill preservation')
        page.get_by_role('button', name='작업 공간으로', exact=True).click()
        expect(page.get_by_role('navigation', name='주요 탐색').get_by_role('button', name='요약', exact=True)).to_have_attribute('aria-current', 'page')
        page.get_by_role('button', name='프로젝트 연결', exact=True).click()
        page.get_by_role('textbox', name='프로젝트 폴더', exact=True).fill(str(PROJECT))
        assert page.locator('form input[type="checkbox"]').count() == 0
        page.get_by_role('button', name='선택한 프로젝트 연결', exact=True).click()
        expect(page.get_by_role('combobox', name='현재 프로젝트')).to_contain_text(PROJECT.name)
        expect(page.get_by_role('combobox', name='현재 프로젝트').locator('option')).to_have_count(1)
        page.get_by_role('heading', name='첫 문서 확인', exact=True).wait_for()
        page.screenshot(path=str(OUT / 'first-documents.png'))
        page.get_by_role('button', name='문서 2개 살펴보기', exact=True).click()
        page.get_by_role('heading', name='기록과 문서', exact=True).wait_for()
        assert (PROJECT / 'README.md').read_bytes() == ORIGINAL.encode('utf-8')
        snapshot = invoke(page, 'workspace')
        project_id = snapshot['workspace']['projects'][0]['id']
        assert Path(snapshot['defaultStateDirectory']) == STATE
        assert snapshot['workspace']['settings']['stateDirectory'] is None
        assert not snapshot['workspace']['settings']['backgroundEnabled']
        assert not STATE.exists()
        encoded = ''.join(c if c.isascii() and c.isalnum() else '-' for c in str(PROJECT))
        transcript_dir = Path('\\\\?\\' + str(FAKE_CLAUDE / 'projects' / encoded))
        transcript_dir.mkdir()
        session_id = str(uuid.uuid4())
        parent = None
        with (transcript_dir / f'{session_id}.jsonl').open('w', encoding='utf-8') as transcript:
            for role in ['user', 'assistant', 'user']:
                item_id = str(uuid.uuid4())
                text = '잘해줘' if role == 'user' else '테스트 공급자의 이력 응답'
                item = {'uuid':item_id,'parentUuid':parent,'sessionId':session_id,'cwd':str(PROJECT),'timestamp':datetime.now(timezone.utc).isoformat(),'type':role,'message':{'role':role,'content':text}}
                transcript.write(json.dumps(item, ensure_ascii=False) + '\n')
                parent = item_id
        page.locator('.sidebar nav').get_by_role('button', name='프로젝트', exact=True).click()
        page.get_by_role('tab', name='AI 기록 가져오기', exact=True).click()
        expect(page.get_by_text(str(STATE), exact=True)).to_be_visible()
        assert not STATE.exists()
        page.get_by_role('button', name='AI 기록 수집 켜기', exact=True).click()
        expect(page.get_by_text('마지막 반영', exact=False)).to_contain_text('success')
        assert (STATE / 'silolink.sqlite').exists()
        snapshot = invoke(page,'workspace')
        assert len(snapshot['records']) == 3
        assert snapshot['analysis']['userRequests'] == 2
        assert snapshot['analysis']['repeatedRequests'][0]['count'] == 2
        page.get_by_role('button', name='일간·주간 회고', exact=True).click()
        expect(page.get_by_role('heading', name='2개의 요청이 남아 있습니다.', exact=True)).to_be_visible()
        page.locator('.sidebar-bottom').get_by_role('button', name='설정', exact=True).click()
        page.get_by_role('navigation', name='설정 분류').get_by_role('button', name='기록·수집', exact=True).click()
        page.get_by_label('백그라운드 수집과 안내', exact=True).uncheck()
        page.get_by_role('button', name='설정 저장', exact=True).click()
        expect(page.get_by_role('status')).to_contain_text('설정을 저장했습니다.')
        checks.append('native connect, opt-in imports actual fixture transcript to the default folder before the first interval, and daily review updates')

        def nav(label):
            if page.get_by_role('navigation', name='설정 분류').count():
                page.get_by_role('button', name='작업 공간으로', exact=True).click()
            page.get_by_role('navigation', name='주요 탐색').get_by_role('button',name=label,exact=True).click()
        nav('기록·문서')
        page.get_by_role('button',name='읽기',exact=True).first.click()
        page.locator('.markdown').wait_for()
        page.locator('.markdown').get_by_role('button',name='Related document',exact=True).click()
        page.locator('.markdown').get_by_role('heading',name='Related guide',exact=True).wait_for()
        assert not page.evaluate('Boolean(window.untrustedExecuted)')
        markdown = page.locator('.markdown')
        assert markdown.get_by_role('table').count() == 2
        expect(markdown.get_by_role('cell', name='각본 승인 | 시트 그리기', exact=True)).to_be_visible()
        assert markdown.get_by_role('columnheader', name='비용', exact=True).evaluate('(cell)=>getComputedStyle(cell).textAlign') == 'right'
        checks_list = markdown.get_by_role('checkbox')
        assert checks_list.count() == 2
        assert checks_list.nth(0).is_checked() and not checks_list.nth(1).is_checked()
        assert checks_list.nth(0).is_disabled() and checks_list.nth(1).is_disabled()
        expect(markdown.locator('del')).to_have_text('이전 방향')
        expect(markdown.get_by_role('button', name='https://example.org/guide', exact=True)).to_be_visible()
        assert markdown.locator('script, iframe, img').count() == 0
        original_url = page.url
        markdown.get_by_role('link', name='중복 제목으로 이동', exact=True).click()
        assert page.evaluate('document.activeElement.id.endsWith("시작-조건-1")')
        assert page.url == original_url
        markdown.get_by_role('link', name='1', exact=True).click()
        assert page.evaluate('document.activeElement.tagName') == 'LI'
        markdown.get_by_role('link', name='본문으로 돌아가기', exact=True).click()
        assert page.evaluate('document.activeElement.tagName') == 'A'
        for width, theme in [(1320, 'light'), (1040, 'dark')]:
            page.set_viewport_size({'width':width, 'height':900})
            page.evaluate('(theme)=>document.documentElement.dataset.theme=theme', theme)
            assert markdown.locator('.markdown-table-scroll').nth(1).evaluate('(el)=>el.scrollWidth>el.clientWidth')
            assert markdown.locator('pre').evaluate('(el)=>el.scrollWidth>el.clientWidth')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            markdown.get_by_role('heading', name='시작 조건', exact=True).first.scroll_into_view_if_needed()
            page.screenshot(path=str(OUT / f'markdown-{width}-{theme}.png'))
        page.set_viewport_size(original_size)
        page.evaluate('document.documentElement.dataset.theme="system"')
        markdown.get_by_role('button', name='원문 제목으로 이동', exact=True).click()
        page.locator('.markdown').get_by_role('heading', name='Native desktop verification', exact=True).wait_for()
        assert page.evaluate('document.activeElement.textContent') == 'Native desktop verification'
        checks.append('GFM tables/alignment, readonly tasks, strikethrough, autolinks, scoped footnotes/headings, cross-document anchor, wide tables/code at 1320-light/1040-dark, no global overflow or active HTML/images')
        denied = page.evaluate('async v=>{try{await window.__TAURI_INTERNALS__.invoke("read_document",v);return null;}catch(e){return e;}}',{'projectId':project_id,'path':'../outside.md','revision':None})
        assert denied['code']=='DOCUMENT_OUT_OF_SCOPE'
        checks.append('real document read, internal Markdown navigation, HTML isolation, path traversal denied')

        nav('학습')
        page.get_by_role('button', name='학습 주제 추가', exact=True).click()
        page.get_by_label('학습 주제',exact=True).fill('부분 실패의 처리 조건')
        page.get_by_label('배운 내용과 적용할 일',exact=True).fill('성공 결과를 보존하고 실패 범위를 표시한다.')
        page.get_by_role('button',name='학습 주제 저장',exact=True).click()
        expect(page.get_by_role('button',name='부분 실패의 처리 조건')).to_be_focused()
        page.get_by_role('button',name='다음 작업에 적용',exact=True).click()
        nav('작업·일정')
        page.get_by_role('button',name='본인 작업 기록',exact=True).click()
        time.sleep(.3)
        page.get_by_role('button',name='시간 기록 중지',exact=True).click()
        task = invoke(page,'workspace')['workspace']['tasks'][0]
        assert task['spans'][0]['endedAt'] is not None and not task['userTested']
        checks.append('learning persisted, linked task, real timer start/stop, no invented user-test completion')

        nav('조사')
        page.get_by_role('button',name='자료 추가',exact=True).click()
        expect(page.get_by_label('자료 이름',exact=True)).to_be_focused()
        page.get_by_label('자료 이름',exact=True).fill('검증용 공식 근거')
        page.get_by_label('HTTPS 원문 링크',exact=True).fill('https://example.org/reference')
        page.get_by_label('자료에서 확인할 내용',exact=True).fill('원문 미확인 상태를 보존하는 검증 자료')
        page.get_by_role('button',name='자료 저장',exact=True).click()
        expect(page.get_by_role('button',name='검증용 공식 근거')).to_be_focused()
        page.get_by_text('원문 확인 필요',exact=True).wait_for()
        assert invoke(page,'workspace')['workspace']['sources'][0]['verified'] is False
        checks.append('research source kind, claim, URL and unverified state persisted')

        nav('기록·문서')
        page.get_by_role('button',name='정리 변경안',exact=True).click()
        page.get_by_role('combobox',name='수정할 문서',exact=True).select_option('README.md')
        page.get_by_role('button',name='내용 불러오기',exact=True).click()
        page.get_by_role('textbox',name='정리 이유',exact=True).fill('본문에서 직접 작성한 변경')
        page.get_by_role('textbox',name='변경 후 본문',exact=True).fill(ORIGINAL+'\nBody edit from the actual UI.\n')
        page.get_by_role('button',name='이전·이후와 영향 검토',exact=True).click()
        page.get_by_text('검토 가능',exact=True).wait_for()
        page.get_by_role('button',name='이 프로젝트에 실제 반영',exact=True).click()
        page.get_by_text('변경 상태: applied',exact=False).wait_for()
        assert 'Body edit' in (PROJECT/'README.md').read_text()
        page.get_by_role('button',name='이력 불러오기',exact=True).click()
        page.locator('button:not([disabled])').filter(has_text='이 변경 복구').first.click()
        page.get_by_text('변경 상태: rolled-back',exact=False).wait_for()
        assert (PROJECT/'README.md').read_bytes()==ORIGINAL.encode()
        page.get_by_role('button',name='고급 · JSON 직접 입력',exact=True).click()
        plan = {'schemaVersion':1,'id':str(uuid.uuid4()),'projectId':project_id,'rationale':'Native UI change and recovery','operations':[{'path':'README.md','expectedRevision':hashlib.sha256(ORIGINAL.encode()).hexdigest(),'content':ORIGINAL+'\nReviewed change.\n'}],'guards':[]}
        def inspect_plan():
            page.get_by_role('textbox',name='문서 변경안 JSON',exact=True).fill(json.dumps(plan,ensure_ascii=False))
            page.get_by_role('button',name='원문·영향 검사',exact=True).click()
            page.get_by_text('검토 가능',exact=True).wait_for()
        inspect_plan()
        external = ORIGINAL+'\nExternal edit.\n'
        (PROJECT/'README.md').write_bytes(external.encode('utf-8'))
        page.get_by_role('button',name='이 프로젝트에 실제 반영',exact=True).click()
        page.get_by_text('변경 상태: conflict',exact=False).wait_for()
        assert (PROJECT/'README.md').read_bytes()==external.encode('utf-8')
        (PROJECT/'README.md').write_bytes(ORIGINAL.encode('utf-8'))
        plan['id']=str(uuid.uuid4())
        inspect_plan()
        page.get_by_role('button',name='이 프로젝트에 실제 반영',exact=True).click()
        page.get_by_text('변경 상태: applied',exact=False).wait_for()
        assert 'Reviewed change.' in (PROJECT/'README.md').read_text()
        page.get_by_role('button',name='이력 불러오기',exact=True).click()
        page.locator('button:not([disabled])').filter(has_text='이 변경 복구').first.click()
        page.get_by_text('변경 상태: rolled-back',exact=False).wait_for()
        assert (PROJECT/'README.md').read_bytes()==ORIGINAL.encode()
        checks.append('real core plan check, external edit preserved, apply, journal read, byte-exact undo')

        nav('대화')
        page.get_by_role('button', name='자료 선택', exact=True).click()
        page.get_by_role('button',name='최근 요청 30개 선택',exact=True).click()
        page.get_by_role('textbox',name='질문 입력',exact=True).fill('선택한 요청에서 더 확인할 조건을 설명해줘.')
        page.get_by_role('button',name='질문하기',exact=True).click()
        chat=wait_chat(page,'completed')
        page.get_by_text('[테스트 공급자의 고정 응답]',exact=False).first.wait_for()
        assert len(chat['evidenceIds'])==2
        page.get_by_role('button',name='노트로 남기기',exact=True).click()
        page.get_by_role('combobox',name='사용할 AI 도구',exact=True).select_option('claude')
        page.get_by_role('textbox',name='질문 입력',exact=True).fill('앞의 대화를 다른 도구에서도 이어서 살펴보자.')
        page.get_by_role('button',name='질문하기',exact=True).click()
        continued=wait_chat(page,'completed')
        assert continued['provider']=='claude' and 'previous assistant' in continued['context']
        page.get_by_role('button',name='새 대화',exact=True).last.click()
        page.get_by_role('textbox',name='질문 입력',exact=True).fill('SIMULATE_PROVIDER_FAILURE')
        page.get_by_role('button',name='질문하기',exact=True).click()
        failed=wait_chat(page,'failed')
        assert len(failed['messages'])==1 and failed['error']['code']=='AI_PROCESS_FAILED'
        page.get_by_role('button',name='새 대화',exact=True).last.click()
        page.get_by_role('textbox',name='질문 입력',exact=True).fill('WAIT_FOR_CANCELLATION')
        page.get_by_role('button',name='질문하기',exact=True).click()
        page.get_by_role('button',name='중지',exact=True).click()
        wait_chat(page,'cancelled')
        child_pid=int((OUT/'provider.pid').read_text())
        for _ in range(50):
            if not process_alive(child_pid):break
            time.sleep(.1)
        assert not process_alive(child_pid),'Cancelled provider process is still alive'
        checks.append('real child process output, selected evidence, provider switch, context carryover, failure, cancellation and child termination')

        page.locator('.sidebar-bottom').get_by_role('button',name='설정',exact=True).click()
        page.get_by_role('navigation', name='설정 분류').get_by_role('button', name='알림·회고', exact=True).click()
        page.get_by_label('하루 마감 시각',exact=True).fill('22:10')
        page.get_by_role('combobox',name='주간 회고 요일',exact=True).select_option('4')
        page.get_by_role('navigation', name='설정 분류').get_by_role('button', name='화면', exact=True).click()
        page.get_by_role('combobox',name='화면 테마',exact=True).select_option('dark')
        page.get_by_role('button',name='설정 저장',exact=True).click()
        page.get_by_role('status').get_by_text('설정을 저장했습니다.',exact=True).wait_for()
        # The user's reported workflow: a skill's CLI init, with the installed
        # app already open and optional background history collection disabled.
        before = invoke(page, 'workspace')['workspace']
        assert not before['settings']['backgroundEnabled']
        live_project = OUT / 'CLI에서 연결한 프로젝트'
        live_project.mkdir()
        (live_project / 'skill-note.md').write_text('# 스킬로 연결한 문서\n', encoding='utf-8')
        for _ in range(2):
            result = subprocess.run([str(bundled_cli), 'init', '--project', str(live_project)],
                env=dict(os.environ, PATH='', SILOLINK_PROJECT_REGISTRY_DIR=str(OUT / 'shared-projects')),
                capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
            assert result.returncode == 0, result.stderr.decode('utf-8')
        # No IPC workspace read or refresh button before the visible assertion:
        # this must be delivered by the running application's discovery event.
        expect(page.get_by_role('combobox', name='현재 프로젝트')).to_contain_text(live_project.name)
        expect(page.get_by_role('combobox', name='현재 프로젝트').locator('option')).to_have_count(2)
        after = invoke(page, 'workspace')
        assert len(after['workspace']['projects']) == 2
        for key in ['notes', 'settings', 'chats', 'tasks']:
            assert after['workspace'][key] == before[key]
        live_id = next(p['id'] for p in after['workspace']['projects'] if p['name'] == live_project.name)
        inventory = next(i for i in after['inventories'] if i['projectId'] == live_id)
        assert inventory['report']['documents'][0]['path'] == 'skill-note.md'
        assert after['projectConnectionErrors'] == []
        assert len(after['records']) == 3
        nav('기록·문서')
        page.get_by_role('combobox', name='현재 프로젝트', exact=True).select_option(live_id)
        page.get_by_role('button', name='읽기', exact=True).first.click()
        page.locator('.markdown').get_by_role('heading', name='스킬로 연결한 문서', exact=True).wait_for()
        page.screenshot(path=str(OUT / 'skill-init-live.png'))
        page.get_by_role('combobox', name='현재 프로젝트', exact=True).select_option(project_id)
        checks.append('CLI skill init appears live without refresh/background collection, repeat is deduplicated, documents visible and existing workspace preserved')
        nav('요약')
        page.screenshot(path=str(OUT/'native-home.png'))
        # The redesigned navigation exposes every destination, including contextual pages.
        review_size = page.evaluate('({width:innerWidth,height:innerHeight})')
        for width, height in [(1320, 900), (1040, 800), (960, 640)]:
            page.set_viewport_size({'width':width, 'height':height})
            for theme in ['light', 'dark']:
                page.evaluate('(theme)=>document.documentElement.dataset.theme=theme', theme)
                for label in ['요약', '대화', '작업·일정', '일간·주간 회고', '기록·문서', '사용 분석', '조사', '학습', '프로젝트', '변경안 검토']:
                    menu = page.get_by_role('navigation', name='주요 탐색').get_by_role('button', name=label, exact=True)
                    page.locator('.workspace').evaluate('(el)=>el.scrollTop=el.scrollHeight')
                    menu.click()
                    expect(menu).to_have_attribute('aria-current', 'page')
                    assert page.locator('.sidebar [aria-current="page"]').count() == 1
                    expect(page.locator('.page h1')).to_have_count(1)
                    if label == '요약':
                        expect(page.get_by_role('table', name='연결한 프로젝트')).to_be_visible()
                    else:
                        expect(page.locator('.page h1')).to_be_in_viewport()
                    assert page.get_by_role('combobox', name='현재 프로젝트').input_value() == project_id
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, theme, label)
                    assert page.locator('.workspace').evaluate('(el)=>el.scrollWidth <= el.clientWidth'), (width, theme, label)
                nav('요약')
                page.locator('.workspace').evaluate('(el)=>el.scrollTop=0')
                page.screenshot(path=str(OUT / f'redesign-{theme}-{width}.png'))
                settings_menu = page.locator('.sidebar-bottom').get_by_role('button', name='설정', exact=True)
                settings_menu.click()
                settings_nav = page.get_by_role('navigation', name='설정 분류')
                assert settings_nav.evaluate('(el)=>!!el.closest("#app-navigation")')
                expect(page.get_by_role('navigation', name='주요 탐색')).to_have_count(0)
                expect(settings_nav.get_by_role('button', name='AI 도구', exact=True)).to_have_attribute('aria-current', 'page')
                page.get_by_role('button', name='사이드바 접기', exact=True).click()
                assert page.locator('.sidebar').bounding_box()['width'] == 72
                settings_nav.get_by_role('button', name='화면', exact=True).click()
                expect(page.get_by_role('combobox', name='화면 테마', exact=True)).to_be_visible()
                assert page.locator('.workspace').evaluate('(el)=>el.scrollWidth <= el.clientWidth')
                page.get_by_role('button', name='작업 공간으로', exact=True).click()
                expect(page.get_by_role('navigation', name='주요 탐색').get_by_role('button', name='요약', exact=True)).to_have_attribute('aria-current', 'page')
                compact_docs = page.get_by_role('navigation', name='주요 탐색').get_by_role('button', name='기록·문서', exact=True)
                compact_docs.hover()
                expect(page.get_by_role('tooltip')).to_have_text('기록·문서')
                compact_docs.click()
                expect(compact_docs).to_have_attribute('aria-current', 'page')
                assert page.get_by_role('combobox', name='현재 프로젝트').input_value() == project_id
                assert page.locator('.workspace').evaluate('(el)=>el.scrollWidth <= el.clientWidth')
                page.screenshot(path=str(OUT / f'folded-{theme}-{width}.png'))
                page.get_by_role('button', name='사이드바 펼치기', exact=True).click()
        page.set_viewport_size(review_size)
        page.evaluate('document.documentElement.dataset.theme="dark"')
        checks.append('all ten menu destinations and settings show current location, preserve project scope and avoid horizontal overflow at 1320/1040/960 in both themes')
        page.locator('.sidebar-bottom').get_by_role('button',name='설정',exact=True).click()
        page.get_by_role('navigation', name='설정 분류').get_by_role('button', name='앱 관리', exact=True).click()
        page.get_by_role('button',name='앱 완전히 종료',exact=True).click()
        process.wait(timeout=10)
        log.close()
        assert process.returncode==0
        process,browser,page,log=launch(playwright,'restarted')
        restored=invoke(page,'workspace')['workspace']
        assert all(tool['status'] == 'installed' for tool in invoke(page,'tool_connections')['tools'])
        assert restored['settings']['reviewTime']=='22:10'
        assert restored['settings']['reviewWeekday']==4
        assert restored['settings']['theme']=='dark'
        assert len(restored['projects'])==2 and len(restored['tasks'])==1 and len(restored['notes'])==2
        assert restored['tasks'][0]['spans'][0]['endedAt'] is not None
        checks.append('clean exit, restart, project/notes/source/task/timer/chat/review settings persisted')
        custom_state = OUT / 'custom-record-store'
        invoke(page, 'mutate', {'request':{'operation':'settings','settings':dict(restored['settings'], stateDirectory=str(custom_state))}})
        page.get_by_role('button', name='새로고침', exact=True).click()
        nav('프로젝트')
        page.get_by_role('tab', name='AI 기록 가져오기', exact=True).click()
        expect(page.get_by_text(str(custom_state), exact=True)).to_be_visible()
        page.get_by_role('combobox', name='현재 프로젝트', exact=True).select_option(project_id)
        page.get_by_role('button', name='AI 대화 기록 가져오기', exact=True).click()
        expect(page.locator('.status-banner')).to_contain_text('수집을 마쳤')
        assert (custom_state / 'silolink.sqlite').is_file()
        assert (STATE / 'silolink.sqlite').is_file()
        page.locator('.sidebar-bottom').get_by_role('button',name='설정',exact=True).click()
        page.get_by_role('navigation', name='설정 분류').get_by_role('button', name='기록·수집', exact=True).click()
        page.get_by_role('button', name='기본 위치 사용', exact=True).click()
        page.get_by_role('button', name='설정 저장', exact=True).click()
        expect(page.get_by_role('status')).to_contain_text('설정을 저장했습니다.')
        assert invoke(page, 'workspace')['workspace']['settings']['stateDirectory'] is None
        assert (custom_state / 'silolink.sqlite').is_file()
        checks.append('custom directory overrides the default for manual collection and both stores remain intact after returning to the default')
        page.get_by_role('navigation', name='설정 분류').get_by_role('button', name='앱 관리', exact=True).click()
        page.get_by_role('button',name='앱 완전히 종료',exact=True).click()
        process.wait(timeout=10)
    except Exception:
        try:page.screenshot(path=str(OUT/'failure.png'))
        except Exception:pass
        raise
    finally:
        if process.poll() is None:
            try:invoke(page,'quit_application')
            except Exception:pass
            try:process.wait(timeout=5)
            except subprocess.TimeoutExpired:process.terminate()
        log.close()
assert not errors,errors
(OUT/'result.json').write_text(json.dumps({'executable':str(EXE),'checks':checks,'errors':errors,'profile':str(PROFILE)},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':checks,'errors':errors,'output':str(OUT)},ensure_ascii=True))
