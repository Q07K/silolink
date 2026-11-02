fn main() {
    #[cfg(windows)]
    {
        let icon = "desktop/src-tauri/icons/icon.ico";
        println!("cargo:rerun-if-changed={icon}");
        // Link only the public CLI, not the shared library or test providers.
        tauri_winres::WindowsResource::new()
            .set_icon(icon)
            .set("ProductName", "SiloLink")
            .set("FileDescription", "SiloLink CLI")
            .set("InternalName", "SiloLink CLI")
            .set("OriginalFilename", "silolink.exe")
            .set("CompanyName", "SiloLink")
            .compile_for(&["silolink"])
            .expect("could not embed the SiloLink CLI process name and icon");
    }
}
