use crate::{
    error::{Error, Result},
    history,
    project::{self, Project},
    store::Store,
};
use serde_json::{Value, json};
use std::path::Path;
pub async fn collect(
    project: &Project,
    directory: &Path,
    provider: &str,
    limit: usize,
) -> Result<Value> {
    let mut store = Store::open(directory, false)?;
    let token = store.acquire(project)?;
    let report = history::collect(project, provider, limit).await;
    let result = store.commit(project, &report, &token);
    let released = store.release(project, &token);
    let mut report = result?;
    released?;
    report["command"] = json!("sync");
    report["storePath"] = json!(store.path);
    Ok(report)
}
pub fn read(project: &Project, directory: &Path, provider: &str) -> Result<Value> {
    let store = Store::open(directory, true)?;
    let mut report = store.read(project, provider)?;
    for(key,value)in json!({"schemaVersion":1,"command":"records","mode":"stored-text-history","status":"success","project":project.json(),"provider":provider,"storePath":store.path}).as_object().unwrap(){report[key]=value.clone();}
    Ok(report)
}

pub async fn watch(
    project: &Project,
    directory: &Path,
    provider: &str,
    interval: std::time::Duration,
    mut stop: tokio::sync::watch::Receiver<bool>,
    mut emit: impl FnMut(&Value) -> Result<()>,
) -> Result<u8> {
    if interval.is_zero() || interval > std::time::Duration::from_secs(86400) {
        return Err(Error::new(
            "INVALID_ARGUMENTS",
            "Collection interval must be positive and no more than one day.",
        ));
    }
    while !*stop.borrow() {
        let report = match collect(project, directory, provider, crate::cli::MAX_ITEMS).await {
            Ok(mut value) => {
                value["command"] = json!("watch");
                value["intervalMs"] = json!(interval.as_millis());
                value
            }
            Err(error) => {
                json!({"schemaVersion":1,"command":"watch","status":"failed","observedAt":project::now(),"project":project.json(),"intervalMs":interval.as_millis(),"error":error.json()})
            }
        };
        emit(&report)?;
        if *stop.borrow() {
            break;
        }
        tokio::select! {_=tokio::time::sleep(interval)=>(),changed=stop.changed()=>{if changed.is_err(){break;}}}
    }
    Ok(130)
}
