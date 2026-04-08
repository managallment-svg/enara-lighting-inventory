use std::{
  env, fs,
  path::{Path, PathBuf},
};

#[cfg(target_os = "windows")]
fn prepare_windows_icon_path(source: &Path) -> PathBuf {
  let temp_icon_dir = env::temp_dir().join("enara-lighting-inventory").join("tauri-build");
  fs::create_dir_all(&temp_icon_dir).expect("failed to create temporary icon directory");

  let temp_icon_path = temp_icon_dir.join("icon.ico");
  fs::copy(source, &temp_icon_path).expect("failed to copy Windows icon to temporary ASCII path");
  temp_icon_path
}

fn watch_path(path: &Path) {
  if !path.exists() {
    return;
  }

  println!("cargo:rerun-if-changed={}", path.display());

  if path.is_dir() {
    let entries = fs::read_dir(path).expect("failed to read watched directory");

    for entry in entries.flatten() {
      watch_path(&entry.path());
    }
  }
}

fn main() {
  println!("cargo:rerun-if-changed=tauri.conf.json");
  println!("cargo:rerun-if-changed=icons/icon.ico");
  println!("cargo:rerun-if-changed=icons/icon.icns");
  println!("cargo:rerun-if-changed=icons/icon.png");
  println!("cargo:rerun-if-changed=icons/32x32.png");
  println!("cargo:rerun-if-changed=icons/128x128.png");
  println!("cargo:rerun-if-changed=icons/128x128@2x.png");
  println!("cargo:rerun-if-env-changed=TAURI_WINDOWS_ICON_PATH");

  watch_path(Path::new("../dist"));
  watch_path(Path::new("../dist-tauri"));
  watch_path(Path::new("../src"));
  watch_path(Path::new("../public"));
  watch_path(Path::new("../index.html"));
  watch_path(Path::new("../vite.config.ts"));
  watch_path(Path::new("../package.json"));

  let icon_source =
    std::env::var("TAURI_WINDOWS_ICON_PATH").unwrap_or_else(|_| "icons/icon.ico".to_string());

  #[cfg(target_os = "windows")]
  let icon_path = prepare_windows_icon_path(Path::new(&icon_source));

  #[cfg(not(target_os = "windows"))]
  let icon_path = PathBuf::from(&icon_source);

  let attributes = tauri_build::Attributes::new()
    .windows_attributes(tauri_build::WindowsAttributes::new().window_icon_path(&icon_path));

  tauri_build::try_build(attributes).expect("failed to run tauri build");
}