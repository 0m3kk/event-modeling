use tauri::{
  menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
  AppHandle, Emitter, Runtime,
};

/// Event name the native menu emits when one of our custom items is activated.
/// The payload is the item id (e.g. "file.save"). Keep in sync with
/// `src/constants/menu.ts`.
const MENU_ACTION_EVENT: &str = "app-menu-action";

fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
  // --- File ---------------------------------------------------------------
  let new_board = MenuItemBuilder::with_id("file.new", "New Board").build(app)?;
  let open_local = MenuItemBuilder::with_id("file.open", "Open File…")
    .accelerator("CmdOrCtrl+O")
    .build(app)?;
  let open_drive =
    MenuItemBuilder::with_id("file.open_drive", "Open from Google Drive").build(app)?;
  let save_local = MenuItemBuilder::with_id("file.save", "Save")
    .accelerator("CmdOrCtrl+S")
    .build(app)?;
  let save_drive =
    MenuItemBuilder::with_id("file.save_drive", "Save to Google Drive").build(app)?;
  let restore_backup =
    MenuItemBuilder::with_id("file.restore_backup", "Restore Backup").build(app)?;
  let close_window = PredefinedMenuItem::close_window(app, None)?;

  let file_builder = SubmenuBuilder::new(app, "File")
    .item(&new_board)
    .item(&open_local)
    .item(&open_drive)
    .separator()
    .item(&save_local)
    .item(&save_drive)
    .separator()
    .item(&restore_backup)
    .separator()
    .item(&close_window);

  // macOS puts Quit in the application menu; other platforms expect it here.
  #[cfg(not(target_os = "macos"))]
  let file_builder = {
    let quit = PredefinedMenuItem::quit(app, None)?;
    file_builder.separator().item(&quit)
  };

  let file = file_builder.build()?;

  // --- Edit ---------------------------------------------------------------
  // These are OS-provided items so native text editing (undo, clipboard,
  // select-all) keeps working inside inputs. Commands targeting the canvas are
  // dispatched through the event below.
  let edit = SubmenuBuilder::new(app, "Edit")
    .undo()
    .redo()
    .separator()
    .cut()
    .copy()
    .paste()
    .select_all()
    .separator()
    .item(
      &MenuItemBuilder::with_id("edit.search", "Search…")
        .accelerator("CmdOrCtrl+F")
        .build(app)?,
    )
    .build()?;

  // --- View ---------------------------------------------------------------
  let view_builder = SubmenuBuilder::new(app, "View")
    .item(
      &MenuItemBuilder::with_id("view.zoom_in", "Zoom In")
        .accelerator("CmdOrCtrl+=")
        .build(app)?,
    )
    .item(
      &MenuItemBuilder::with_id("view.zoom_out", "Zoom Out")
        .accelerator("CmdOrCtrl+-")
        .build(app)?,
    )
    .item(
      &MenuItemBuilder::with_id("view.zoom_reset", "Reset Zoom")
        .accelerator("CmdOrCtrl+0")
        .build(app)?,
    );

  #[cfg(target_os = "macos")]
  let view_builder = view_builder.separator().fullscreen();

  let view = view_builder.build()?;

  // --- Export -------------------------------------------------------------
  let export = SubmenuBuilder::new(app, "Export")
    .item(&MenuItemBuilder::with_id("export.image", "Export Image…").build(app)?)
    .item(&MenuItemBuilder::with_id("export.json_schema", "Export JSON Schema…").build(app)?)
    .separator()
    .item(&MenuItemBuilder::with_id("export.drive", "Export to Google Drive").build(app)?)
    .build()?;

  // --- Menu bar -----------------------------------------------------------
  let mut menu_builder = MenuBuilder::new(app);

  #[cfg(target_os = "macos")]
  {
    let app_menu = SubmenuBuilder::new(app, "Event Modeling")
      .about(None)
      .separator()
      .services()
      .separator()
      .hide()
      .hide_others()
      .show_all()
      .separator()
      .quit()
      .build()?;
    menu_builder = menu_builder.item(&app_menu);
  }

  menu_builder = menu_builder
    .item(&file)
    .item(&edit)
    .item(&view)
    .item(&export);

  #[cfg(target_os = "macos")]
  {
    let window_menu = SubmenuBuilder::new(app, "Window")
      .minimize()
      .maximize()
      .separator()
      .close_window()
      .build()?;
    menu_builder = menu_builder.item(&window_menu);
  }

  menu_builder.build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_oauth::init())
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let menu = build_menu(app.handle())?;
      app.set_menu(menu)?;

      Ok(())
    })
    .on_menu_event(|app, event| {
      let _ = app.emit(MENU_ACTION_EVENT, event.id().as_ref().to_string());
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
