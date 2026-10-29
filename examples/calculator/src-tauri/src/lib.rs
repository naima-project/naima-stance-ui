// The shell: one window showing the built page, and the platform port's commands. The mobile targets enter
// here directly; the desktop ones through main.rs.
//
// When STANCE_UI_E2E holds a script (the stance's `platforms` check sets it), the shell evaluates it in the
// page once the page has loaded and prints its report as one line, "e2e: {...}". The app stays open, so that
// the check can take its screenshot with the result on screen, and then ends it. Without the variable
// nothing of this runs.
mod port;

use tauri::webview::PageLoadEvent;

#[tauri::command]
fn e2e_report(report: serde_json::Value) {
    println!("e2e: {report}");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let e2e = std::env::var("STANCE_UI_E2E").ok().filter(|s| !s.trim().is_empty());
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![port::describe, e2e_report])
        .on_page_load(move |webview, payload| {
            if let (Some(script), PageLoadEvent::Finished) = (&e2e, payload.event()) {
                println!("e2e: page loaded, running the script");
                let run = format!(
                    "Promise.resolve().then(() => ({script})).then((r) => r, (e) => ({{ ok: false, says: String(e) }}))\
                     .then((report) => window.__TAURI_INTERNALS__.invoke('e2e_report', {{ report }}))"
                );
                if let Err(e) = webview.eval(&run) {
                    println!("e2e: {}", serde_json::json!({ "ok": false, "says": format!("cannot evaluate the script: {e}") }));
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("the app could not start");
}
