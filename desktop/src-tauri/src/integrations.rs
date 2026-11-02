use serde_json::Value;
use silolink::{
    error::{Error, Result},
    install,
};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, path::BaseDirectory};

fn paths(app: &AppHandle) -> Result<(PathBuf, PathBuf)> {
    let home = std::env::var_os("SILOLINK_USER_HOME")
        .map(PathBuf::from)
        .or_else(dirs::home_dir)
        .ok_or_else(|| {
            Error::new(
                "INSTALL_DIRECTORY_NOT_FOUND",
                "Cannot locate your user folder.",
            )
        })?;
    let executable = app
        .path()
        .resolve("bin/silolink.exe", BaseDirectory::Resource)
        .map_err(|_| {
            Error::new(
                "CLI_UNAVAILABLE",
                "The bundled SiloLink executable is unavailable. Reinstall SiloLink.",
            )
        })?;
    Ok((home, executable))
}

pub fn status(app: &AppHandle) -> Result<Value> {
    let (home, executable) = paths(app)?;
    install::inspect_user(&home, &executable)
}

pub fn connect(app: &AppHandle, host: &str) -> Result<Value> {
    if !install::HOSTS.contains(&host) {
        return Err(Error::new(
            "INVALID_ARGUMENTS",
            "Choose Codex, Claude Code, or Antigravity.",
        ));
    }
    let (home, executable) = paths(app)?;
    install::setup(host, "user", &home, &home, &executable)
}
