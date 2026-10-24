use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use em_codegen_core::generator::{GenerateOptions, GeneratedOutput, Generator};
use em_codegen_rust::RustGenerator;

fn sample_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples/authentication.spec.yaml")
}

fn generate_sample(templates: Option<PathBuf>) -> GeneratedOutput {
    let loaded = em_codegen_core::model::load_spec(sample_path()).expect("sample parses");
    let options = GenerateOptions {
        templates,
        ..GenerateOptions::default()
    };
    RustGenerator
        .generate(&loaded.model, &options)
        .expect("generation succeeds")
}

fn generate_source(source: &str) -> GeneratedOutput {
    let loaded = em_codegen_core::model::parse_spec(source, "test.spec.yaml").expect("spec parses");
    RustGenerator
        .generate(&loaded.model, &GenerateOptions::default())
        .expect("generation succeeds")
}

fn find<'a>(output: &'a GeneratedOutput, path: &str) -> Option<&'a str> {
    output
        .files
        .iter()
        .find(|file| file.path.as_path() == Path::new(path))
        .map(|file| file.contents.as_str())
}

fn unique_dir(name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock after epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("em-codegen-{name}-{nanos}"))
}

#[test]
fn generates_one_folder_per_domain() {
    let output = generate_sample(None);

    for path in [
        "src/domains/identity/commands.rs",
        "src/domains/identity/events.rs",
        "src/domains/identity/queries.rs",
        "src/domains/identity/services.rs",
        "src/domains/identity/states.rs",
        "src/domains/identity/types.rs",
        "src/domains/identity/mod.rs",
        "src/domains/session/commands.rs",
        "src/domains/two_factor/types.rs",
        "src/actors.rs",
        "src/domain_event.rs",
        "src/lib.rs",
    ] {
        assert!(find(&output, path).is_some(), "missing {path}");
    }

    assert!(
        find(&output, "src/event_store.rs").is_none(),
        "the Event envelope comes from the event-store crate"
    );

    // Commands/events/queries/services are no longer flat modules at the root,
    // slices/constraints are not generated at all, and tag metadata is only used
    // to build each event's `tags()` at generation time.
    for path in [
        "src/commands.rs",
        "src/events.rs",
        "src/queries.rs",
        "src/services.rs",
        "src/slices.rs",
        "src/constraints.rs",
        "src/tags.rs",
    ] {
        assert!(find(&output, path).is_none(), "unexpected {path}");
    }

    let identity_commands = find(&output, "src/domains/identity/commands.rs").unwrap();
    assert!(identity_commands.contains("pub struct RegisterAccount {"));
    assert!(identity_commands.contains("pub email: crate::domains::identity::types::Email"));
    assert!(identity_commands.contains("custom(function = \"validate_email\")"));
    assert!(identity_commands.contains("fn validate_email("));
    assert!(identity_commands.contains("#[validate(length("));

    let identity_events = find(&output, "src/domains/identity/events.rs").unwrap();
    assert!(identity_events.contains("pub struct AccountRegistered {"));
    assert!(
        identity_events.contains("impl crate::domain_event::DomainEvent for AccountRegistered")
    );
    assert!(identity_events.contains("fn event_type() -> &'static str"));
    assert!(identity_events.contains("\"account_registered\""));
    assert!(identity_events.contains("crate::domain_event::tag_value"));
    assert!(!identity_events.contains("#[serde(rename ="));

    let identity_types = find(&output, "src/domains/identity/types.rs").unwrap();
    assert!(identity_types.contains("#[serde(rename_all = \"snake_case\")]"));
    assert!(identity_types.contains("Self::Pending => \"pending\""));
    assert!(!identity_types.contains("validator"));

    let totp_commands = find(&output, "src/domains/totp/commands.rs").unwrap();
    assert!(totp_commands.contains("TOTP_CODE_PATTERN"));
    assert!(totp_commands.contains("validator::ValidateRegex::validate_regex"));
    assert!(totp_commands.contains("regex::Regex::new("));

    let passkey_types = find(&output, "src/domains/passkey/types.rs").unwrap();
    assert!(passkey_types.contains("Self::CrossPlatform => \"cross_platform\""));
    assert!(!passkey_types.contains("validator"));

    let actors = find(&output, "src/actors.rs").unwrap();
    assert!(actors.contains("\"account_owner\""));
    assert!(actors.contains("\"identity:send_activation_email\""));

    let identity_services = find(&output, "src/domains/identity/services.rs").unwrap();
    assert!(identity_services.contains("pub trait AccountNotification"));
    assert!(identity_services.contains("impl std::future::Future"));
    assert!(identity_services.contains("+ Send;"));

    let password_services = find(&output, "src/domains/password/services.rs").unwrap();
    assert!(password_services.contains("pub trait PasswordNotification"));
    assert!(
        password_services.contains("crate::domains::identity::types::Email"),
        "cross-domain type is fully qualified"
    );
    assert!(
        password_services
            .contains("pub reset_token: crate::domains::password::types::PasswordResetToken")
    );

    let lib = find(&output, "src/lib.rs").unwrap();
    assert!(lib.contains("pub mod domain_event;"));
    assert!(!lib.contains("pub mod event_store;"));
    assert!(lib.contains("pub use domain_event::DomainEvent;"));
    assert!(lib.contains("pub use event_store::Event;"));
    assert!(!lib.contains("pub mod tags;"));
    assert!(!lib.contains("TagDefinition"));
    assert!(!lib.contains("pub mod events;"));
    assert!(
        !lib.contains("pub mod shared;"),
        "no shared items in the sample"
    );

    let manifest = find(&output, "Cargo.toml").unwrap();
    assert!(manifest.contains("edition = \"2024\""));
    assert!(manifest.contains("event-store = { git = \"https://github.com/0m3kk/backend-kit\" }"));
    assert!(manifest.contains("validator ="));
    assert!(manifest.contains("regex ="));
}

#[test]
fn validation_is_limited_to_commands_and_queries() {
    let output = generate_sample(None);

    for file in &output.files {
        let path = file.path.to_string_lossy();
        if path.ends_with(".rs") && file.contents.contains("validator::") {
            assert!(
                path.ends_with("/commands.rs") || path.ends_with("/queries.rs"),
                "validation leaked into {path}"
            );
        }
    }

    for path in [
        "src/domains/identity/types.rs",
        "src/domains/identity/events.rs",
        "src/domains/identity/states.rs",
        "src/domains/identity/services.rs",
    ] {
        let source = find(&output, path).unwrap();
        assert!(!source.contains("validator"), "{path} has validation");
    }
}

#[test]
fn generated_code_contains_no_allow_attributes() {
    let output = generate_sample(None);
    for file in &output.files {
        assert!(
            !file.contents.contains("#[allow(") && !file.contents.contains("#![allow("),
            "{} contains an allow attribute",
            file.path.display()
        );
    }
}

#[test]
fn maps_temporal_and_uuid_types() {
    let source = r#"
name: Temporal
domains:
  - name: scheduling
groups:
  - name: schedulingTypes
    domain: scheduling
    cards: [EventDate, EventTime, EventAt, EventId]
types:
  - alias: EventDate
    of: date
  - alias: EventTime
    of: time
  - alias: EventAt
    of: datetime
  - alias: EventId
    of: uuid
commands:
  - name: scheduleEvent
    inputs:
      - name: date
        type: date
        required: true
      - name: time
        type: time
        required: true
      - name: at
        type: datetime
        required: true
      - name: id
        type: uuid
        required: true
      - name: token
        type: string
        required: true
        validation:
          format: uuid
slices:
  - name: scheduleEvent
    domain: scheduling
    lanes:
      - type: Command
        cards: [scheduleEvent]
"#;
    let output = generate_source(source);

    let commands = find(&output, "src/domains/scheduling/commands.rs").unwrap();
    assert!(commands.contains("pub date: chrono::NaiveDate"));
    assert!(commands.contains("pub time: chrono::NaiveTime"));
    assert!(commands.contains("pub at: chrono::DateTime<chrono::Utc>"));
    assert!(commands.contains("pub id: uuid::Uuid"));
    assert!(commands.contains("pub token: uuid::Uuid"));

    let types = find(&output, "src/domains/scheduling/types.rs").unwrap();
    assert!(types.contains("pub struct EventDate(pub chrono::NaiveDate)"));
    assert!(types.contains("pub struct EventTime(pub chrono::NaiveTime)"));
    assert!(types.contains("pub struct EventAt(pub chrono::DateTime<chrono::Utc>)"));
    assert!(types.contains("pub struct EventId(pub uuid::Uuid)"));

    let manifest = find(&output, "Cargo.toml").unwrap();
    assert!(manifest.contains("chrono ="));
    assert!(manifest.contains("uuid ="));
}

#[test]
fn generates_the_domain_event_contract() {
    let output = generate_sample(None);

    let trait_source = find(&output, "src/domain_event.rs").unwrap();
    assert!(trait_source.contains("pub trait DomainEvent"));
    assert!(trait_source.contains("fn event_type() -> &'static str;"));
    assert!(trait_source.contains("fn tags(&self) -> Vec<String>;"));
    assert!(trait_source.contains("fn to_store_event(&self)"));
    assert!(trait_source.contains("fn to_store_event_with_metadata"));
    assert!(
        trait_source.contains("use event_store::Event;"),
        "the trait uses the shared Event type"
    );

    assert!(
        find(&output, "src/event_store.rs").is_none(),
        "the Event type is imported from the event-store crate, not redefined"
    );
    let manifest = find(&output, "Cargo.toml").expect("manifest");
    assert!(manifest.contains("event-store = { git = \"https://github.com/0m3kk/backend-kit\" }"));
}

#[test]
fn template_overrides_win_and_fall_back_to_embedded_defaults() {
    let directory = unique_dir("overrides");
    std::fs::create_dir_all(directory.join("rust")).expect("create override dir");
    std::fs::write(
        directory.join("rust/actors.rs.j2"),
        "// custom actors template\n",
    )
    .expect("write override");

    let output = generate_sample(Some(directory.clone()));

    assert_eq!(
        find(&output, "src/actors.rs").map(str::trim),
        Some("// custom actors template")
    );
    let lib = find(&output, "src/lib.rs").expect("embedded lib template still renders");
    assert!(lib.contains("Rust crate generated"));

    std::fs::remove_dir_all(directory).ok();
}

#[test]
fn unassigned_items_land_in_a_shared_module() {
    let source = r#"
name: Shared
types:
  - alias: PingId
    of: string
commands:
  - name: ping
    inputs:
      - name: id
        type: PingId
        required: true
"#;
    let output = generate_source(source);

    assert!(find(&output, "src/shared/mod.rs").is_some());
    let commands = find(&output, "src/shared/commands.rs").expect("shared commands");
    assert!(commands.contains("pub struct Ping {"));
    assert!(commands.contains("pub id: crate::shared::types::PingId"));

    let lib = find(&output, "src/lib.rs").unwrap();
    assert!(lib.contains("pub mod shared;"));
}
