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

/// Runs a script the way CI does: Windows PowerShell started from PowerShell 7 inherits a module path
/// whose Microsoft.PowerShell.Security cannot load in Windows PowerShell.
fn run_script(name: &str, arguments: &[&std::ffi::OsStr]) -> std::process::Output {
    let modules = TempDir::new().unwrap();
    let security = modules.path().join("Microsoft.PowerShell.Security");
    fs::create_dir(&security).unwrap();
    fs::write(
        security.join("Microsoft.PowerShell.Security.psd1"),
        "@{ ModuleVersion = '7.0.0.0'; PowerShellVersion = '7.0'; CmdletsToExport = @('Get-AuthenticodeSignature') }",
    )
    .unwrap();
    let inherited = std::env::var_os("PSModulePath").unwrap_or_default();
    let module_path = std::env::join_paths(
        std::iter::once(modules.path().to_path_buf()).chain(std::env::split_paths(&inherited)),
    )
    .unwrap();
    Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("scripts")
                .join(name),
        )
        .args(arguments)
        .env("PSModulePath", module_path)
        .output()
        .unwrap()
}

fn assert_failed_with(output: &std::process::Output, reason: &str) {
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        !output.status.success() && stderr.contains(reason),
        "expected a failure mentioning {reason:?}, got:\n{stderr}"
    );
}

#[test]
fn signed_binaries_are_placed_only_when_every_file_carries_a_valid_signature() {
    let root = TempDir::new().unwrap();
    let signed = root.path().join("signed");
    fs::create_dir(&signed).unwrap();
    let unsigned = Path::new(env!("CARGO_BIN_EXE_silolink"));
    fs::copy(unsigned, signed.join("silolink.exe")).unwrap();
    let build = root.path().join("build");
    let resources = root.path().join("resources");
    let place = || {
        run_script(
            "use-signed-binaries.ps1",
            &[
                "-SignedDirectory".as_ref(),
                signed.as_os_str(),
                "-BuildDirectory".as_ref(),
                build.as_os_str(),
                "-ResourceDirectory".as_ref(),
                resources.as_os_str(),
            ],
        )
    };
    assert_failed_with(&place(), "missing silolink-desktop.exe");
    fs::copy(unsigned, signed.join("silolink-desktop.exe")).unwrap();
    assert_failed_with(&place(), "not validly signed");
    assert!(!build.exists() && !resources.exists());
}

#[test]
fn signature_required_release_rejects_unsigned_files_before_writing_output() {
    let root = TempDir::new().unwrap();
    let build = root.path().join("build");
    fs::create_dir_all(build.join("bin")).unwrap();
    fs::create_dir_all(build.join("bundle/nsis")).unwrap();
    let unsigned = Path::new(env!("CARGO_BIN_EXE_silolink"));
    fs::copy(unsigned, build.join("silolink.exe")).unwrap();
    fs::copy(unsigned, build.join("bin/silolink.exe")).unwrap();
    fs::copy(
        unsigned,
        build.join("bundle/nsis/SiloLink_0.0.0_x64-setup.exe"),
    )
    .unwrap();
    let output = root.path().join("assets");
    let result = run_script(
        "package-release.ps1",
        &[
            "-BuildDirectory".as_ref(),
            build.as_os_str(),
            "-OutputDirectory".as_ref(),
            output.as_os_str(),
            "-RequireSignature".as_ref(),
        ],
    );
    assert_failed_with(&result, "not validly signed");
    assert!(!output.exists());
}
