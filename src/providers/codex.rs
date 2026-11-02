use super::{Snapshot, next_cursor, rpc::Rpc};
use crate::{
    error::{Error, Result},
    project::{self, Project},
    records,
};
use serde_json::{Value, json};
use std::collections::HashSet;

pub async fn read(project: &Project, limit: usize, observed: &str) -> Snapshot {
    match Rpc::connect().await {
        Ok(mut rpc) => {
            let result = read_with(project, limit, observed, &mut rpc).await;
            rpc.close().await;
            result
        }
        Err(e) => {
            let mut result = Snapshot::new("state-db-only");
            result.error = Some(e.json());
            result
        }
    }
}
pub async fn read_with(project: &Project, limit: usize, observed: &str, rpc: &mut Rpc) -> Snapshot {
    let mut result = Snapshot::new("state-db-only");
    if let Err(e) = collect(project, limit, observed, rpc, &mut result).await {
        result.error = Some(e.json());
    }
    result.finish(limit)
}
async fn collect(
    project: &Project,
    limit: usize,
    observed: &str,
    rpc: &mut Rpc,
    result: &mut Snapshot,
) -> Result<()> {
    let mut cursor = None::<String>;
    let mut thread_cursors = HashSet::new();
    let mut seen = HashSet::new();
    loop {
        let page=rpc.request("thread/list",json!({"cwd":project.root,"sourceKinds":["cli","vscode","exec","appServer","subAgent","subAgentReview","subAgentCompact","subAgentThreadSpawn","subAgentOther","unknown"],"cursor":cursor,"limit":100,"useStateDbOnly":true})).await?;
        let threads = page["data"]
            .as_array()
            .ok_or_else(|| Error::new("INVALID_PROVIDER_RESPONSE", "Invalid Codex thread list."))?;
        for thread in threads {
            if result.items_read >= limit {
                break;
            }
            let Some(id) = records::source_id(&thread["id"]) else {
                result
                    .warnings
                    .push(json!({"code":"INVALID_PROVIDER_SESSION"}));
                continue;
            };
            if !seen.insert(id.to_owned()) {
                continue;
            }
            if let Err(error) = session(project, thread, limit, observed, rpc, result).await {
                if matches!(
                    error.code,
                    "PROVIDER_EXITED"
                        | "PROVIDER_CLOSED"
                        | "PROVIDER_UNAVAILABLE"
                        | "PROVIDER_TIMEOUT"
                        | "INVALID_PROVIDER_PROTOCOL"
                ) || error.details["rpcCode"] == -32601
                {
                    return Err(error);
                }
                let mut warning = error.json();
                warning["sessionId"] = json!(id);
                result.warnings.push(warning);
            }
        }
        cursor = next_cursor(&page, &mut thread_cursors)?;
        if cursor.is_none() || result.items_read >= limit {
            break;
        }
    }
    Ok(())
}
async fn session(
    project: &Project,
    thread: &Value,
    limit: usize,
    observed: &str,
    rpc: &mut Rpc,
    result: &mut Snapshot,
) -> Result<()> {
    project::assert_scope(project, thread["cwd"].as_str().unwrap_or(""))?;
    let mut cursor = None::<String>;
    let mut cursors = HashSet::new();
    loop {
        let page=rpc.request("thread/turns/list",json!({"threadId":thread["id"],"cursor":cursor,"limit":100,"sortDirection":"desc","itemsView":"full"})).await?;
        for turn in page["data"]
            .as_array()
            .ok_or_else(|| Error::new("INVALID_PROVIDER_RESPONSE", "Invalid Codex turn list."))?
        {
            if result.items_read >= limit {
                break;
            }
            let items = turn["items"].as_array().ok_or_else(|| {
                Error::new("INVALID_PROVIDER_RESPONSE", "Invalid Codex turn items.")
            })?;
            let mut bounded = turn.clone();
            bounded["items"] = json!(
                items
                    .iter()
                    .take(limit - result.items_read)
                    .collect::<Vec<_>>()
            );
            result.items_read += bounded["items"].as_array().expect("array").len();
            result.append(records::codex(project, thread, &[bounded], observed));
        }
        cursor = next_cursor(&page, &mut cursors)?;
        if cursor.is_none() || result.items_read >= limit {
            break;
        }
    }
    result.sessions_read += 1;
    Ok(())
}
