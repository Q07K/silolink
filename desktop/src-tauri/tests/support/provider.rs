use std::{
    io::{self, BufRead, Read, Write},
    thread,
    time::Duration,
};
fn main() {
    if std::env::args().any(|arg| arg == "app-server") {
        for line in io::stdin()
            .lock()
            .lines()
            .map_while(std::result::Result::ok)
        {
            let Ok(request) = serde_json::from_str::<serde_json::Value>(&line) else {
                continue;
            };
            let Some(id) = request.get("id") else {
                continue;
            };
            let result = if request["method"] == "initialize" {
                serde_json::json!({"userAgent":"desktop-test-fixture"})
            } else {
                serde_json::json!({"data":[],"nextCursor":null})
            };
            println!("{}", serde_json::json!({"id":id,"result":result}));
            io::stdout().flush().unwrap();
        }
        return;
    }
    let mut prompt = String::new();
    io::stdin().read_to_string(&mut prompt).unwrap();
    if let Some(path) = std::env::var_os("SILOLINK_FIXTURE_PID_FILE") {
        std::fs::write(path, std::process::id().to_string()).unwrap();
    }
    if prompt.contains("WAIT_FOR_CANCELLATION") {
        thread::sleep(Duration::from_secs(600));
    }
    if prompt.contains("SIMULATE_PROVIDER_FAILURE") {
        std::process::exit(3);
    }
    let fixed = "선택한 원문을 확인했습니다. 공통 기준과 로컬 예외를 구별하고 다음 작업에 연결할 수 있습니다. [테스트 공급자의 고정 응답]";
    let answer = if prompt.contains("<requests format=") {
        analysis(&prompt)
    } else if prompt.contains("프로젝트 규칙 문서") {
        "- 배포 전에 점검 스크립트를 먼저 실행한다\n- 점검 결과를 PR 설명에 남긴다\n\n이유: 같은 점검 요청이 반복되었습니다. 긴급 수정에는 적용하지 않습니다.".to_owned()
    } else {
        fixed.to_owned()
    };
    let answer = answer.as_str();
    if std::env::args().any(|s| s == "exec") {
        println!(
            "{}",
            serde_json::json!({"type":"item.completed","item":{"type":"agent_message","text":answer}})
        );
    } else {
        println!("{}", serde_json::json!({"result":answer,"is_error":false}));
    }
}
/// Answers an analysis prompt with discoveries that quote its own request lines, plus one
/// that cites a missing alias so the app's evidence check can be observed.
fn analysis(prompt: &str) -> String {
    let requests: Vec<(String, String)> = prompt
        .lines()
        .filter(|line| line.starts_with('r') && line.contains(" | "))
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(5, " | ").collect();
            (parts.len() == 5).then(|| (parts[0].to_owned(), parts[4].to_owned()))
        })
        .collect();
    let quote = |text: &str| text.chars().take(8).collect::<String>();
    let mut discoveries = vec![];
    if requests.len() >= 2 {
        discoveries.push(serde_json::json!({"kind":"repeated-topic","title":"같은 점검을 여러 번 요청함","summary":"배포 전 점검을 표현만 바꿔 반복했습니다. 규칙으로 남길지 확인하세요.","basis":"observed","term":null,"suggestedAction":"rule",
            "evidence":[{"id":requests[0].0,"quote":quote(&requests[0].1)},{"id":requests[1].0,"quote":quote(&requests[1].1)}]}));
    }
    if let Some((alias, _)) = requests.iter().find(|(_, text)| text.contains("깔끔하게")) {
        discoveries.push(serde_json::json!({"kind":"ambiguous-term","title":"‘깔끔하게’의 뜻이 요청마다 다름","summary":"화면 배치와 코드 구조에 같은 표현을 썼습니다.","basis":"inferred","term":"깔끔하게","suggestedAction":"learn",
            "evidence":[{"id":alias,"quote":"깔끔하게"}]}));
    }
    discoveries.push(serde_json::json!({"kind":"repeated-topic","title":"근거가 없는 항목","summary":"x","evidence":[{"id":"r9999","quote":"x"}]}));
    format!("분석 결과입니다.\n```json\n{}\n```", serde_json::json!({"discoveries":discoveries}))
}
