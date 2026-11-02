#![cfg(windows)]

use serde_json::Value;
use std::{fs, path::Path, process::Command};
use tempfile::TempDir;

fn package(output: &Path, binary: &Path) -> std::process::Output {
    Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(Path::new(env!("CARGO_MANIFEST_DIR")).join("scripts/package-plugin.ps1"))
        .arg("-BinaryPath")
        .arg(binary)
        .arg("-OutputDirectory")
        .arg(output)
        .output()
        .unwrap()
}

#[test]
fn plugin_package_carries_its_cli_and_survives_cache_relocation_without_path_or_source() {
    let temp = TempDir::new().unwrap();
    let output = temp.path().join("한글 체험 패키지");
    let result = package(&output, Path::new(env!("CARGO_BIN_EXE_silolink")));
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let catalog: Value =
        serde_json::from_slice(&fs::read(output.join(".agents/plugins/marketplace.json")).unwrap())
            .unwrap();
    assert_eq!(catalog["plugins"][0]["name"], "silolink");
    assert_eq!(
        catalog["plugins"][0]["source"]["path"],
        "./plugins/silolink"
    );
    assert!(output.join("Codex에 등록.cmd").is_file());
    let plugin = output.join("plugins/silolink");
    let entries = fs::read_dir(plugin.join("skills")).unwrap().count();
    assert_eq!(
        entries, 11,
        "The plugin must expose the same operation skills as the app."
    );
    for name in [
        "silolink-init",
        "silolink-docs",
        "silolink-sync",
        "silolink-docs-undo",
    ] {
        assert!(plugin.join("skills").join(name).join("SKILL.md").is_file());
        assert!(
            plugin
                .join("skills")
                .join(name)
                .join("agents/openai.yaml")
                .is_file()
        );
    }
    let skill = fs::read_to_string(plugin.join("skills/silolink/SKILL.md")).unwrap();
    assert!(skill.contains("../../bin/silolink.exe"));
    assert!(!plugin.join("skills/silolink/installation.json").exists());
    let manifest: Value =
        serde_json::from_slice(&fs::read(plugin.join(".codex-plugin/plugin.json")).unwrap())
            .unwrap();
    assert_eq!(manifest["name"], "silolink");
    assert_eq!(manifest["skills"], "./skills/");
    let cached = temp.path().join("installed cache");
    for relative in [
        "plugin.json",
        ".codex-plugin/plugin.json",
        "skills/silolink/SKILL.md",
        "bin/silolink.exe",
        "assets/icon.png",
    ] {
        let target = cached.join(relative);
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::copy(plugin.join(relative), target).unwrap();
    }
    let project = temp.path().join("my project");
    fs::create_dir(&project).unwrap();
    fs::write(project.join("notes.md"), "# My original notes\r\n").unwrap();
    for command in ["init", "docs"] {
        let result = Command::new(cached.join("bin/silolink.exe"))
            .arg(command)
            .arg("--project")
            .arg(&project)
            .env(
                "SILOLINK_PROJECT_REGISTRY_DIR",
                temp.path().join("registry"),
            )
            .env("PATH", "")
            .current_dir(temp.path())
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        let report: Value = serde_json::from_slice(&result.stdout).unwrap();
        assert_eq!(report["status"], "success");
        if command == "docs" {
            assert_eq!(report["documents"][0]["path"], "notes.md");
        }
    }
    assert_eq!(
        fs::read_to_string(project.join("notes.md")).unwrap(),
        "# My original notes\r\n"
    );
    assert!(!output.join(".silolink").exists());
    assert!(!cached.join(".silolink").exists());
}

#[test]
fn packaging_preserves_existing_output_and_rejects_a_missing_cli_before_writing() {
    let temp = TempDir::new().unwrap();
    let output = temp.path().join("existing");
    fs::create_dir(&output).unwrap();
    fs::write(output.join("my-file.txt"), "keep").unwrap();
    assert!(
        !package(&output, Path::new(env!("CARGO_BIN_EXE_silolink")))
            .status
            .success()
    );
    assert_eq!(
        fs::read_to_string(output.join("my-file.txt")).unwrap(),
        "keep"
    );
    assert!(!output.join("plugins").exists());
    let missing_output = temp.path().join("not-created");
    assert!(
        !package(&missing_output, &temp.path().join("absent.exe"))
            .status
            .success()
    );
    assert!(!missing_output.exists());
}
