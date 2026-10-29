// The platform port's commands on Tauri. Each one is what the page's tauriPort() reaches with invoke, and it
// answers exactly what the web port's handler of the same name answers, so the machines see no difference.
// Add the app's own commands here and list them in lib.rs's generate_handler!.

use serde::Serialize;

/// Where the app runs: the operating system, as Rust names it, and the shell.
#[derive(Serialize)]
pub struct Description {
    platform: &'static str,
    shell: &'static str,
}

#[tauri::command]
pub fn describe() -> Description {
    let d = Description { platform: std::env::consts::OS, shell: "tauri" };
    // One line per call, so that a launch log shows the port answering.
    println!("port: describe -> {} {}", d.platform, d.shell);
    d
}
