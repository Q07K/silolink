"""Walk one full SiloLink cycle in the built WebView2 app with an isolated profile.

collect -> discover -> AI analysis -> rule draft -> cross-project rule -> reviewed change
-> learning card -> evidence-based estimate -> project report. A fixture CLI stands in for
Codex and Claude Code, so no user project, login, or live model is touched.
Build first: cargo build -p silolink-desktop --features custom-protocol --bins --locked
"""
from pathlib import Path
import argparse
import json
import os
import socket
import subprocess
import time
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--executable', type=Path, default=ROOT / 'target' / 'debug' / 'silolink-desktop.exe')
EXE = parser.parse_args().executable.resolve(strict=True)
FIXTURE = EXE.parent / 'silolink-desktop-provider-fixture.exe'
OUT = ROOT / '.tools' / 'desktop-cycle' / str(uuid.uuid4())
APP = OUT / 'cycle-app'
SERVER = OUT / 'cycle-server'
for folder in (APP, SERVER):
    folder.mkdir(parents=True)
(APP / 'README.md').write_text('# Cycle app\n', encoding='utf-8')
(APP / 'AGENTS.md').write_text('# 작업 규칙\n\n- 커밋 메시지는 한국어로 쓴다\n- 디자인 토큰만 사용한다\n', encoding='utf-8')
(SERVER / 'README.md').write_text('# Cycle server\n', encoding='utf-8')
PROFILE = OUT / 'desktop-profile'
FAKE_CLAUDE = OUT / 'fixture-claude'
errors, checks = [], []

def invoke(page, command, args=None):
    return page.evaluate('(v)=>window.__TAURI_INTERNALS__.invoke(v.command,v.args)', {'command': command, 'args': args or {}})

def transcript(project, requests):
    encoded = ''.join(c if c.isascii() and c.isalnum() else '-' for c in str(project))
    folder = Path('\\\\?\\' + str(FAKE_CLAUDE / 'projects' / encoded))
    folder.mkdir(parents=True)
    session = str(uuid.uuid4())
    parent = None
    start = datetime.now(timezone.utc) - timedelta(hours=len(requests))
    with (folder / f'{session}.jsonl').open('w', encoding='utf-8') as out:
        for i, text in enumerate(requests):
            for role, body in (('user', text), ('assistant', '확인했습니다.')):
                item = str(uuid.uuid4())
                at = (start + timedelta(hours=i, minutes=1 if role == 'assistant' else 0)).isoformat()
                out.write(json.dumps({'uuid': item, 'parentUuid': parent, 'sessionId': session, 'cwd': str(project), 'timestamp': at,
                                      'type': role, 'message': {'role': role, 'content': body}}, ensure_ascii=False) + '\n')
                parent = item

transcript(APP, ['배포 스크립트 점검해줘', '배포 스크립트 점검 다시 해줘', '배포 스크립트 점검해줘 한번 더', '설정 화면 깔끔하게 정리해줘',
                 '<command-name>/clear</command-name>'])
transcript(SERVER, ['API 응답 구조 깔끔하게 바꿔줘', '배포 스크립트 점검해줘'])

def launch(playwright, suffix):
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    env = dict(os.environ)
    env.update({
        'SILOLINK_DESKTOP_CONFIG_DIR': str(PROFILE),
        'SILOLINK_USER_HOME': str(OUT / 'tool-user'),
        'SILOLINK_PROJECT_REGISTRY_DIR': str(OUT / 'shared-projects'),
        'SILOLINK_CODEX_EXECUTABLE': str(FIXTURE),
        'SILOLINK_CLAUDE_EXECUTABLE': str(FIXTURE),
        'CLAUDE_CONFIG_DIR': str(FAKE_CLAUDE),
        'WEBVIEW2_USER_DATA_FOLDER': str(OUT / 'webview-profile'),
        'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS': f'--remote-debugging-port={port}',
    })
    log = (OUT / f'{suffix}.log').open('wb')
    process = subprocess.Popen([str(EXE)], cwd=OUT, env=env, stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW)
    endpoint = f'http://127.0.0.1:{port}'
    for _ in range(150):
        if process.poll() is not None:
            raise AssertionError(f'Native application exited ({process.returncode})')
        try:
            urllib.request.urlopen(endpoint + '/json/version', timeout=.5).close()
            break
        except OSError:
            time.sleep(.1)
    browser = playwright.chromium.connect_over_cdp(endpoint)
    page = browser.contexts[0].pages[0]
    page.set_default_timeout(15000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.locator('.app-shell').wait_for()
    return process, page, log

def stop(process, page, log):
    if process.poll() is None:
        try: invoke(page, 'quit_application')
        except Exception: pass
        try: process.wait(timeout=10)
        except subprocess.TimeoutExpired: process.terminate()
    log.close()

def until(read, check, message, tries=150):
    for _ in range(tries):
        value = read()
        if check(value):
            return value
        time.sleep(.1)
    raise AssertionError(f'{message}: {value}')

def nav(page, label):
    page.locator('.sidebar nav').get_by_role('button', name=label, exact=True).click()

def card(page, title):
    return page.get_by_role('article', name=title)

def ask_and_save(page, kind_label):
    page.get_by_role('button', name='질문하기').click()
    chat = until(lambda: invoke(page, 'workspace')['workspace']['chats'], lambda c: c and c[-1]['status'] == 'completed', 'chat did not complete')[-1]
    expect(page.get_by_role('combobox', name='응답 저장 종류')).to_have_value(kind_label)
    page.get_by_role('button', name='노트로 남기기').click()
    return chat

with sync_playwright() as playwright:
    process, page, log = launch(playwright, 'first')
    try:
        ids = [invoke(page, 'mutate', {'request': {'operation': 'connect', 'path': str(p), 'initialize': True}})['id'] for p in (APP, SERVER)]
        app_id, server_id = ids
        for project_id in ids:
            report = invoke(page, 'collect_records', {'projectId': project_id})
            assert report['status'] in ('success', 'partial'), report
        snapshot = invoke(page, 'workspace')
        analysis = snapshot['analysis']
        assert analysis['userRequests'] == 6 and analysis['excludedRequests'] == {'agent': 1}, analysis
        local = [d for d in snapshot['workspace']['discoveries'] if d['source'] == 'local']
        assert len(local) == 1 and len(local[0]['evidence']) == 4 and sorted(local[0]['projectIds']) == sorted(ids), local
        assert any(n['kind'] == 'discovery' for n in snapshot['workspace']['notices'])
        checks.append('collection separates tool-injected prompts and creates a cited cross-project repeated-request discovery with an in-app notice')
    finally:
        stop(process, page, log)

    # Seed finished, timed work so planning has real comparable tasks; also proves restart persistence.
    data_file = PROFILE / 'workspace.json'
    data = json.loads(data_file.read_text(encoding='utf-8'))
    base = datetime(2026, 11, 1, tzinfo=timezone.utc)
    for i, (title, minutes) in enumerate([('로그인 화면 구현', 60), ('로그인 화면 구현 수정', 180), ('결제 API 연동', 300)]):
        data['tasks'].append({'id': str(uuid.uuid4()), 'projectId': server_id, 'title': title, 'phase': '구현', 'completed': True, 'userTested': True,
                              'dueAt': None, 'createdAt': base.isoformat(), 'spans': [{'startedAt': (base + timedelta(days=i)).isoformat(),
                              'endedAt': (base + timedelta(days=i, minutes=minutes)).isoformat()}]})
    data_file.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')

    process, page, log = launch(playwright, 'second')
    try:
        page.get_by_role('combobox', name='현재 프로젝트').select_option(app_id)
        nav(page, '사용 분석')
        expect(page.get_by_role('article', name='비슷한 요청을 4번 했습니다')).to_be_visible()
        page.get_by_role('combobox', name='분석 범위').select_option('all')
        page.get_by_role('button', name='AI 분석 실행').click()
        run = until(lambda: invoke(page, 'workspace')['workspace']['analysisRuns'], lambda r: r and r[-1]['status'] != 'running', 'analysis did not finish')[-1]
        assert run['status'] == 'completed' and run['discoveryCount'] == 2 and run['rejectedCount'] == 1, run
        expect(page.get_by_text('근거가 맞지 않아 제외 1개', exact=False)).to_be_visible()
        term = card(page, '‘깔끔하게’의 뜻이 요청마다 다름')
        expect(term.get_by_text('추정', exact=True)).to_be_visible()
        checks.append('AI analysis through the CLI keeps cited discoveries, drops the uncited one, and labels interpretation')

        repeated = card(page, '같은 점검을 여러 번 요청함')
        repeated.get_by_role('button', name='규칙 초안').click()
        expect(page.get_by_role('combobox', name='질문의 관점')).to_have_value('rule')
        ask_and_save(page, 'rule')
        snapshot = until(lambda: invoke(page, 'workspace'), lambda s: any(n['kind'] == 'rule' for n in s['workspace']['notes']), 'rule note missing')
        rule_note = next(n for n in snapshot['workspace']['notes'] if n['kind'] == 'rule')
        source = next(d for d in snapshot['workspace']['discoveries'] if d['title'] == '같은 점검을 여러 번 요청함')
        assert rule_note['title'] == '같은 점검을 여러 번 요청함 · 규칙 초안', rule_note['title']
        assert rule_note['originId'] == source['id'] and rule_note['id'] in source['followUps'] and source['status'] == 'accepted', (rule_note, source)
        checks.append('a rule draft from a discovery is saved as a rule note linked back to the discovery')

        nav(page, '공통·로컬 규칙')
        page.get_by_role('button', name='규칙 비교').click()
        page.get_by_role('button', name='한 프로젝트에만 2').click()
        page.get_by_role('checkbox', name='배포 전에 점검 스크립트를 먼저 실행한다').check()
        page.get_by_role('checkbox', name='커밋 메시지는 한국어로 쓴다').first.check()
        page.get_by_role('combobox', name='반영할 프로젝트').select_option(server_id)
        page.get_by_role('button', name='변경안 만들어 검토').click()
        page.get_by_role('button', name='이 프로젝트에 실제 반영').click()
        written = until(lambda: (SERVER / 'AGENTS.md').read_text(encoding='utf-8') if (SERVER / 'AGENTS.md').exists() else '', lambda t: '배포 전에' in t, 'rule file not written')
        assert '- 커밋 메시지는 한국어로 쓴다' in written and '## 공통 규칙' in written, written
        history = invoke(page, 'change_history', {'projectId': server_id})['changes']
        assert history, 'applied change is not journaled for undo'
        checks.append('selected rules from another project and from the note become a reviewed, journaled change in the second project')

        page.get_by_role('combobox', name='현재 프로젝트').select_option(app_id)
        nav(page, '사용 분석')
        card(page, '‘깔끔하게’의 뜻이 요청마다 다름').get_by_role('button', name='학습 카드').click()
        expect(page.get_by_role('combobox', name='질문의 관점')).to_have_value('learning')
        ask_and_save(page, 'learning')
        nav(page, '학습')
        page.locator('.note-row').first.click()
        page.get_by_role('combobox', name='학습 진행 상태').select_option('applying')
        note = until(lambda: [n for n in invoke(page, 'workspace')['workspace']['notes'] if n['kind'] == 'learning'], lambda n: n and n[0].get('status') == 'applying', 'learning status not saved')[0]
        assert note['originId'], note
        checks.append('a learning card from an ambiguous term keeps its evidence and progress status')

        page.get_by_role('combobox', name='현재 프로젝트').select_option(server_id)
        nav(page, '작업·일정')
        page.get_by_role('textbox', name='이어갈 작업').fill('회원가입 화면 구현')
        page.get_by_role('combobox', name='작업 관점').fill('구현')
        page.get_by_role('button', name='작업 추가').click()
        page.locator('section.panel', has_text='회원가입 화면 구현').get_by_role('button', name='실적으로 예상').click()
        expect(page.get_by_text('로그인 화면 구현 수정', exact=False)).to_be_visible()
        expect(page.get_by_text('비슷한 완료 작업 2개 기준', exact=False)).to_be_visible()
        assert not page.get_by_text('결제 API 연동 · ', exact=False).count()
        checks.append('a new task gets an estimate range from similar finished, timed tasks and shows its references')

        nav(page, '일간·주간 회고')
        page.get_by_role('tab', name='주간').click()
        page.get_by_role('button', name='미리 보기').click()
        expect(page.get_by_role('heading', name='cycle-server 정리서')).to_be_visible()
        server_report = invoke(page, 'preview_project_report', {'projectId': server_id})['markdown']
        assert '로그인 화면 구현' in server_report and '## 범위와 한계' in server_report, server_report
        app_report = invoke(page, 'preview_project_report', {'projectId': app_id})['markdown']
        assert '같은 점검을 여러 번 요청함' in app_report and '## 학습' in app_report and '## 규칙' in app_report, app_report
        checks.append('the weekly review shows a shareable project report with reviewed discoveries, work, and stated limits')
        page.screenshot(path=str(OUT / 'cycle-report.png'))
    except Exception:
        try: page.screenshot(path=str(OUT / 'failure.png'))
        except Exception: pass
        raise
    finally:
        stop(process, page, log)

assert not errors, errors
(OUT / 'result.json').write_text(json.dumps({'checks': checks, 'errors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'passed': checks, 'output': str(OUT)}, ensure_ascii=True))
