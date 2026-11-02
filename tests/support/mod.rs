use std::path::Path;
pub fn directory_link(target: &Path, link: &Path) {
    #[cfg(unix)]
    std::os::unix::fs::symlink(target, link).unwrap();
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let result=std::process::Command::new("powershell.exe").args(["-NoProfile","-NonInteractive","-Command","New-Item -ItemType Junction -Path $env:SILOLINK_TEST_LINK -Target $env:SILOLINK_TEST_TARGET -ErrorAction Stop | Out-Null"]).env("SILOLINK_TEST_LINK",link).env("SILOLINK_TEST_TARGET",target).creation_flags(0x08000000).output().unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
    }
}
