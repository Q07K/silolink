use serde_json::{Value, json};
use std::{
    io::{self, BufRead, Write},
    time::Duration,
};
fn main() {
    let scenario = std::env::var("SILOLINK_FIXTURE_SCENARIO").unwrap_or_else(|_| "normal".into());
    let root = std::env::var("SILOLINK_FIXTURE_ROOT").unwrap_or_default();
    if scenario == "store-crash" {
        let project = silolink::project::read(std::path::Path::new(&root)).unwrap();
        let state = std::env::var("SILOLINK_FIXTURE_STATE").unwrap();
        let mut store = silolink::store::Store::open(std::path::Path::new(&state), false).unwrap();
        store.acquire(&project).unwrap();
        let db = rusqlite::Connection::open(&store.path).unwrap();
        db.execute_batch("BEGIN IMMEDIATE; UPDATE records SET payload='{\"interrupted\":true}';")
            .unwrap();
        println!("ready");
        io::stdout().flush().unwrap();
        loop {
            std::thread::sleep(Duration::from_secs(1));
        }
    }
    for line in io::stdin().lock().lines() {
        let Ok(line) = line else {
            break;
        };
        let Ok(request) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let Some(id) = request.get("id") else {
            continue;
        };
        let method = request["method"].as_str().unwrap_or("");
        if method != "initialize" {
            match scenario.as_str() {
                "exit" => std::process::exit(9),
                "stall" => {
                    std::thread::sleep(Duration::from_secs(10));
                    continue;
                }
                "malformed" => {
                    println!("invalid json");
                    io::stdout().flush().unwrap();
                    continue;
                }
                "rpcerror" => {
                    println!(
                        "{}",
                        json!({"id":id,"error":{"code":-32601,"message":"unsupported"}})
                    );
                    io::stdout().flush().unwrap();
                    continue;
                }
                _ => (),
            }
        }
        let result = match method {
            "initialize" => json!({"userAgent":"fixture"}),
            "thread/list" => {
                if request["params"]["cursor"].is_null() {
                    let mut list = vec![
                        json!({"id":"thread","cwd":if scenario=="foreign"{format!("{root}-other")}else{root.clone()},"source":"exec"}),
                    ];
                    if scenario == "bad-session" {
                        list.insert(0, Value::Null);
                    }
                    json!({"data":list,"nextCursor":"threads-next"})
                } else {
                    json!({"data":[],"nextCursor":null})
                }
            }
            "thread/turns/list" => {
                let next = request["params"]["cursor"].is_null();
                json!({"data":[{"id":if next{"turn-one"}else{"turn-two"},"startedAt":1793577600,"items":[{"id":if next{"one"}else{"two"},"type":"agentMessage","text":"response","phase":"final_answer"}]}],"nextCursor":if next||scenario=="loop"{json!("turn-next")}else{Value::Null}})
            }
            _ => Value::Null,
        };
        println!("{}", json!({"id":id,"result":result}));
        io::stdout().flush().unwrap();
    }
}
