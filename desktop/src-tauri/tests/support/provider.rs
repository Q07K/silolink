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
    let answer = "선택한 원문을 확인했습니다. 공통 기준과 로컬 예외를 구별하고 다음 작업에 연결할 수 있습니다. [테스트 공급자의 고정 응답]";
    if std::env::args().any(|s| s == "exec") {
        println!(
            "{}",
            serde_json::json!({"type":"item.completed","item":{"type":"agent_message","text":answer}})
        );
    } else {
        println!("{}", serde_json::json!({"result":answer,"is_error":false}));
    }
}
