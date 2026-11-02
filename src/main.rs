use serde_json::{Value, json};
use silolink::{
    changes, cli, documents,
    error::{Error, Result},
    history, install, project, sync,
};
use std::{
    io::{self, Write},
    process::ExitCode,
};
fn emit(value: &Value) -> Result<()> {
    writeln!(io::stdout().lock(), "{value}").map_err(|e| {
        Error::io(
            if e.kind() == io::ErrorKind::BrokenPipe {
                "OUTPUT_CLOSED"
            } else {
                "OUTPUT_ERROR"
            },
            "Cannot write CLI output.",
            &e,
        )
    })
}
async fn run() -> Result<u8> {
    let options = cli::parse(&std::env::args().skip(1).collect::<Vec<_>>())?;
    if options.command == "help" {
        io::stdout()
            .lock()
            .write_all(cli::HELP.as_bytes())
            .map_err(|e| {
                Error::io(
                    if e.kind() == io::ErrorKind::BrokenPipe {
                        "OUTPUT_CLOSED"
                    } else {
                        "OUTPUT_ERROR"
                    },
                    "Cannot write CLI output.",
                    &e,
                )
            })?;
        return Ok(0);
    }
    let mut report = if options.command == "init" {
        cli::init(&options)?
    } else if options.command == "setup" {
        let home = std::env::var_os("SILOLINK_USER_HOME")
            .map(std::path::PathBuf::from)
            .or_else(dirs::home_dir)
            .ok_or_else(|| {
                Error::new(
                    "INSTALL_DIRECTORY_NOT_FOUND",
                    "Cannot resolve the user installation directory.",
                )
            })?;
        install::setup(
            &options.host,
            &options.scope,
            &options.directory,
            &home,
            &std::env::current_exe().map_err(|e| {
                Error::io(
                    "CLI_UNAVAILABLE",
                    "Cannot locate the native executable.",
                    &e,
                )
            })?,
        )?
    } else {
        let project = project::read(&options.directory)?;
        match options.command.as_str() {
            "docs" => documents::scan(&project)?,
            "docs-check" => changes::check(&project, options.plan.as_deref().unwrap())?,
            "docs-apply" => changes::apply(
                &project,
                options.plan.as_deref().unwrap(),
                options.state_dir.as_deref().unwrap(),
            )?,
            "docs-changes" => changes::list(
                &project,
                options.state_dir.as_deref().unwrap(),
                options.change.as_deref(),
            )?,
            "docs-undo" => changes::undo(
                &project,
                options.state_dir.as_deref().unwrap(),
                options.change.as_deref().unwrap(),
            )?,
            "history" => {
                let mut report = history::collect(&project, &options.provider, options.limit).await;
                report["command"] = json!("history");
                report
            }
            "sync" => {
                sync::collect(
                    &project,
                    options.state_dir.as_deref().unwrap(),
                    &options.provider,
                    options.limit,
                )
                .await?
            }
            "records" => sync::read(
                &project,
                options.state_dir.as_deref().unwrap(),
                &options.provider,
            )?,
            "watch" => {
                let (send, receive) = tokio::sync::watch::channel(false);
                tokio::spawn(async move {
                    #[cfg(unix)]
                    {
                        if let Ok(mut terminate) = tokio::signal::unix::signal(
                            tokio::signal::unix::SignalKind::terminate(),
                        ) {
                            tokio::select! {_=tokio::signal::ctrl_c()=>(),_=terminate.recv()=>()}
                        } else {
                            let _ = tokio::signal::ctrl_c().await;
                        }
                    }
                    #[cfg(not(unix))]
                    {
                        let _ = tokio::signal::ctrl_c().await;
                    }
                    let _ = send.send(true);
                });
                return sync::watch(
                    &project,
                    options.state_dir.as_deref().unwrap(),
                    &options.provider,
                    std::time::Duration::from_secs(options.interval_seconds),
                    receive,
                    emit,
                )
                .await;
            }
            _ => unreachable!("validated command"),
        }
    };
    if matches!(
        options.command.as_str(),
        "docs-apply" | "docs-changes" | "docs-undo"
    ) {
        report["command"] = json!(options.command);
    }
    emit(&report)?;
    Ok(match report["status"].as_str() {
        Some("partial") => 2,
        Some("failed") => 1,
        _ => 0,
    })
}
#[tokio::main(flavor = "current_thread")]
async fn main() -> ExitCode {
    match run().await {
        Ok(code) => ExitCode::from(code),
        Err(error) if error.code == "OUTPUT_CLOSED" => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!(
                "{}",
                json!({"schemaVersion":1,"status":"failed","error":error.json()})
            );
            ExitCode::FAILURE
        }
    }
}
