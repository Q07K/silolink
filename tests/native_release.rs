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

fn run_script(name: &str, arguments: &[&std::ffi::OsStr]) -> std::process::Output {
    Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("scripts")
                .join(name),
        )
        .args(arguments)
        .output()
        .unwrap()
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
    let missing = place();
    assert!(!missing.status.success());
    assert!(String::from_utf8_lossy(&missing.stderr).contains("missing silolink-desktop.exe"));
    fs::copy(unsigned, signed.join("silolink-desktop.exe")).unwrap();
    let rejected = place();
    assert!(!rejected.status.success());
    assert!(String::from_utf8_lossy(&rejected.stderr).contains("not validly signed"));
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
    assert!(!result.status.success());
    assert!(String::from_utf8_lossy(&result.stderr).contains("not validly signed"));
    assert!(!output.exists());
}
