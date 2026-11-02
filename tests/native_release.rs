#![cfg(windows)]

use std::{fs, path::Path, process::Command};
use tempfile::TempDir;

#[test]
fn release_version_accepts_matching_tags_and_rejects_mismatched_tags() {
    let script = Path::new(env!("CARGO_MANIFEST_DIR")).join("scripts/release-version.ps1");
    let run = |tag: &str| {
        Command::new("powershell.exe")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(&script)
            .arg("-Tag")
            .arg(tag)
            .output()
            .unwrap()
    };
    let result = run(&format!("v{}", env!("CARGO_PKG_VERSION")));
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert_eq!(
        String::from_utf8_lossy(&result.stdout).trim(),
        env!("CARGO_PKG_VERSION")
    );
    assert!(!run("v99.0.0").status.success());
    assert!(!run("v0.1.0;invalid").status.success());
}

#[test]
fn release_packaging_requires_a_real_build_and_preserves_existing_output() {
    let root = TempDir::new().unwrap();
    let build = root.path().join("build");
    fs::create_dir(&build).unwrap();
    let output = root.path().join("assets");
    fs::create_dir(&output).unwrap();
    fs::write(output.join("keep.txt"), "keep").unwrap();
    let script = Path::new(env!("CARGO_MANIFEST_DIR")).join("scripts/package-release.ps1");
    let result = Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&script)
        .arg("-BuildDirectory")
        .arg(&build)
        .arg("-OutputDirectory")
        .arg(&output)
        .output()
        .unwrap();
    assert!(!result.status.success());
    assert_eq!(fs::read_to_string(output.join("keep.txt")).unwrap(), "keep");
    let absent_output = root.path().join("not-created");
    let missing_build = Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(script)
        .arg("-BuildDirectory")
        .arg(build)
        .arg("-OutputDirectory")
        .arg(&absent_output)
        .output()
        .unwrap();
    assert!(!missing_build.status.success());
    assert!(!absent_output.exists());
}
