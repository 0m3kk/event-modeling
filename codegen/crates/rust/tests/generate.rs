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

fn assert_sorted_dependencies(manifest: &str) {
    let dependencies = manifest
        .split("[dependencies]")
        .nth(1)
        .expect("manifest has dependencies");
    let names: Vec<&str> = dependencies
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| line.split('=').next().unwrap_or_default().trim())
        .collect();
    let mut sorted = names.clone();
    sorted.sort_unstable();
    assert_eq!(names, sorted, "dependencies are not sorted");
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
        "src/domains/account/commands.rs",
        "src/domains/account/events.rs",
        "src/domains/account/queries.rs",
        "src/domains/account/services.rs",
        "src/domains/account/states.rs",
        "src/domains/account/types.rs",
        "src/domains/account/mod.rs",
        "src/domains/session/commands.rs",
        "src/domains/two_factor/types.rs",
        "src/actors.rs",
        "src/action.rs",
        "src/lib.rs",
    ] {
        assert!(find(&output, path).is_some(), "missing {path}");
    }
    assert!(
        find(&output, "src/domain_event.rs").is_none(),
        "DomainEvent comes from the event-store crate"
    );

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

    assert!(
        find(&output, "src/domains/account/views.rs").is_none(),
        "the sample has no View cards, so views.rs is not generated"
    );
    let account_mod = find(&output, "src/domains/account/mod.rs").unwrap();
    assert!(!account_mod.contains("pub mod views;"));

    let account_commands = find(&output, "src/domains/account/commands.rs").unwrap();
    assert!(account_commands.contains("pub struct RegisterAccount {"));
    assert!(account_commands.contains("pub email: crate::domains::account::types::Email"));
    assert!(account_commands.contains("custom(function = \"validate_email\")"));
    assert!(account_commands.contains("fn validate_email("));
    assert!(account_commands.contains("#[validate(length("));

    let account_events = find(&output, "src/domains/account/events.rs").unwrap();
    assert!(account_events.contains("pub struct AccountRegistered {"));
    assert!(account_events.contains("impl event_store::DomainEvent for AccountRegistered"));
    assert!(account_events.contains("fn event_type() -> &'static str"));
    assert!(account_events.contains("\"account_registered\""));
    assert!(account_events.contains("event_store::tag_value"));
    assert!(!account_events.contains("#[serde(rename ="));

    let account_types = find(&output, "src/domains/account/types.rs").unwrap();
    assert!(account_types.contains("#[serde(rename_all = \"snake_case\")]"));
    assert!(account_types.contains("Self::Pending => \"pending\""));
    assert!(!account_types.contains("validator"));

    let totp_commands = find(&output, "src/domains/totp/commands.rs").unwrap();
    assert!(totp_commands.contains("TOTP_CODE_PATTERN"));
    assert!(totp_commands.contains("validator::ValidateRegex::validate_regex"));
    assert!(totp_commands.contains("regex::Regex::new("));

    let passkey_types = find(&output, "src/domains/passkey/types.rs").unwrap();
    assert!(passkey_types.contains("Self::CrossPlatform => \"cross_platform\""));
    assert!(!passkey_types.contains("validator"));

    let actors = find(&output, "src/actors.rs").unwrap();
    assert!(actors.contains("\"account_owner\""));
    assert!(actors.contains("\"account:send_activation_email\""));

    let account_services = find(&output, "src/domains/account/services.rs").unwrap();
    assert!(account_services.contains("pub trait AccountNotification"));
    assert!(account_services.contains("impl std::future::Future"));
    assert!(account_services.contains("+ Send;"));

    let password_services = find(&output, "src/domains/password/services.rs").unwrap();
    assert!(password_services.contains("pub trait PasswordNotification"));
    assert!(
        password_services.contains("crate::domains::account::types::Email"),
        "cross-domain type is fully qualified"
    );
    assert!(
        password_services
            .contains("pub reset_token: crate::domains::password::types::PasswordResetToken")
    );

    let lib = find(&output, "src/lib.rs").unwrap();
    assert!(lib.contains("pub mod action;"));
    assert!(lib.contains("pub use action::Action;"));
    assert!(!lib.contains("pub mod domain_event;"));
    assert!(!lib.contains("pub mod event_store;"));
    assert!(
        !lib.contains("pub use event_store"),
        "Event types are not re-exported"
    );
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
        "src/domains/account/types.rs",
        "src/domains/account/events.rs",
        "src/domains/account/states.rs",
        "src/domains/account/services.rs",
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
    assert_sorted_dependencies(manifest);
}

#[test]
fn generated_files_end_with_a_newline() {
    let output = generate_sample(None);

    for file in &output.files {
        assert!(
            file.contents.ends_with('\n'),
            "{} has no trailing newline",
            file.path.display()
        );
    }
    for file in &output.migrations {
        assert!(
            file.contents.ends_with('\n'),
            "{} has no trailing newline",
            file.path.display()
        );
    }
}

#[test]
fn json_dependency_is_emitted_only_when_used() {
    let output = generate_sample(None);
    let manifest = find(&output, "Cargo.toml").expect("manifest");
    assert!(
        manifest.contains("serde_json = \"1\""),
        "the sample has JSON fields"
    );
    assert_sorted_dependencies(manifest);

    let source = r#"
name: NoJson
commands:
  - name: ping
"#;
    let output = generate_source(source);

    let manifest = find(&output, "Cargo.toml").expect("manifest");
    assert!(
        !manifest.contains("serde_json"),
        "no JSON fields means no serde_json dependency"
    );
    assert_sorted_dependencies(manifest);
}

#[test]
fn uses_the_event_store_domain_event_contract() {
    let output = generate_sample(None);

    assert!(
        find(&output, "src/domain_event.rs").is_none(),
        "the DomainEvent trait is imported from the event-store crate, not redefined"
    );
    assert!(
        find(&output, "src/event_store.rs").is_none(),
        "the Event type is imported from the event-store crate, not redefined"
    );

    let events = find(&output, "src/domains/account/events.rs").expect("account events");
    assert!(events.contains("impl event_store::DomainEvent for AccountRegistered"));
    assert!(events.contains("event_store::tag_value"));

    let lib = find(&output, "src/lib.rs").expect("lib");
    assert!(
        !lib.contains("pub use event_store"),
        "the Event types are not re-exported"
    );

    let readme = find(&output, "README.md").expect("readme");
    assert!(readme.contains("use event_store::{DomainEvent, Event};"));

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

    let actors = find(&output, "src/actors.rs").expect("actors");
    assert!(actors.contains("// custom actors template"));
    assert!(actors.starts_with("// Generated by `em-codegen`"));
    let lib = find(&output, "src/lib.rs").expect("embedded lib template still renders");
    assert!(lib.contains("Rust crate generated"));

    std::fs::remove_dir_all(directory).ok();
}

#[test]
fn every_generated_file_is_marked_as_generated() {
    let output = generate_sample(None);

    for file in output.files.iter().chain(output.migrations.iter()) {
        let path = file.path.to_string_lossy();
        let prefix = if path.ends_with(".rs") {
            "// Generated by `em-codegen`"
        } else if path.ends_with(".md") {
            "<!-- Generated by `em-codegen`"
        } else if path.ends_with(".sql") {
            "-- Generated by `em-codegen`"
        } else {
            "# Generated by `em-codegen`"
        };

        assert!(
            file.contents.starts_with(prefix),
            "{} is missing the generated header",
            file.path.display()
        );
        assert!(
            file.contents
                .contains("Do not edit this file by hand; regenerate it instead."),
            "{} is missing the do-not-edit note",
            file.path.display()
        );
    }
}

#[test]
fn commands_and_queries_expose_their_action() {
    let output = generate_sample(None);

    let commands = find(&output, "src/domains/account/commands.rs").unwrap();
    assert!(commands.contains("impl crate::action::Action for RegisterAccount {"));
    assert!(commands.contains("\"account:register_account\""));
    assert!(commands.contains("/// Action: `account:register_account`."));

    let queries = find(&output, "src/domains/totp/queries.rs").unwrap();
    assert!(queries.contains("impl crate::action::Action for GetTotpStatusParams {"));
    assert!(queries.contains("\"totp:get_totp_status\""));

    let trait_source = find(&output, "src/action.rs").unwrap();
    assert!(trait_source.contains("pub trait Action"));
    assert!(trait_source.contains("fn action() -> &'static str;"));

    let actors = find(&output, "src/actors.rs").unwrap();
    assert!(actors.contains("pub fn can_execute<A: crate::action::Action>"));
}

#[test]
fn commands_without_an_action_do_not_claim_one() {
    let source = r#"
name: NoAction
commands:
  - name: ping
"#;
    let output = generate_source(source);

    let commands = find(&output, "src/shared/commands.rs").unwrap();
    assert!(commands.contains("pub struct Ping {"));
    assert!(!commands.contains("impl crate::action::Action"));
}

#[test]
fn generates_states_and_views_with_separate_handler_traits() {
    let source = r#"
name: Projections
domains:
  - name: orders
types:
  - alias: OrderId
    of: string
events:
  - name: orderPlaced
    fields:
      - name: orderId
        type: string
        required: true
        tag: order
commands:
  - name: placeOrder
    inputs:
      - name: orderId
        type: string
        required: true
slices:
  - name: placeOrder
    domain: orders
    lanes:
      - type: Command
        cards: [placeOrder]
      - type: Event
        cards: [orderPlaced]
      - type: State
        cards: [orderRegistry]
      - type: View
        cards: [orderList]
states:
  - name: orderRegistry
    params:
      - name: orderId
        type: string
        required: true
    query:
      - types: [orderPlaced]
    states:
      - name: status
        type: string
        required: true
views:
  - name: orderList
    table: order_list_view
    key: [orderId]
    params:
      - name: orderId
        type: string
        required: true
    query:
      - types: [orderPlaced]
    states:
      - name: count
        type: integer
"#;
    let output = generate_source(source);

    let states = find(&output, "src/domains/orders/states.rs").expect("states.rs");
    assert!(!states.contains("OrderRegistryParams"));
    assert!(states.contains("pub struct OrderRegistry {"));
    assert!(states.contains("pub order_id: String,"));
    assert!(states.contains("pub fn new(order_id: String) -> Self"));
    assert!(states.contains("status: Default::default(),"));
    assert!(states.contains("pub trait OrderRegistryReducer {"));
    assert!(!states.contains("Store"));
    assert!(!states.contains("fn rehydrate("));
    assert!(states.contains("fn on_order_placed("));
    assert!(states.contains("event: &crate::domains::orders::events::OrderPlaced"));
    assert!(!states.contains("std::future::Future"));

    let views = find(&output, "src/domains/orders/views.rs").expect("views.rs");
    assert!(!views.contains("OrderListParams"));
    assert!(views.contains("pub struct OrderList {"));
    assert!(!views.contains("pub fn new("));
    assert!(views.contains("pub const ORDER_LIST_VIEW: ViewDefinition"));
    assert!(views.contains("table: \"order_list_view\""));
    assert!(views.contains("key: &[\"order_id\"]"));
    assert!(views.contains("pub trait OrderListStore {"));
    assert!(!views.contains("fn rehydrate("));
    assert!(views.contains("fn on_order_placed("));
    assert!(views.contains("position: event_store::SequencePosition"));
    assert!(!views.contains("view: &mut OrderList"));
    assert!(
        views.contains(
            "    ) -> impl std::future::Future<Output = Result<(), Self::Error>> + Send;"
        ),
        "view handlers are asynchronous"
    );

    let domain_mod = find(&output, "src/domains/orders/mod.rs").expect("domain mod");
    assert!(domain_mod.contains("pub mod states;"));
    assert!(domain_mod.contains("pub mod views;"));

    let lib = find(&output, "src/lib.rs").expect("lib");
    assert!(lib.contains("1 states, 1 views and"));
    assert!(lib.contains("0 service methods"));
}

#[test]
fn states_without_params_implement_default_and_views_do_not() {
    let source = r#"
name: Projections
domains:
  - name: catalog
events:
  - name: productCreated
    fields:
      - name: productId
        type: string
        required: true
        tag: product
slices:
  - name: listProducts
    domain: catalog
    lanes:
      - type: Event
        cards: [productCreated]
      - type: State
        cards: [productRegistry]
      - type: View
        cards: [productList]
states:
  - name: productRegistry
    query:
      - types: [productCreated]
    states:
      - name: count
        type: integer
views:
  - name: productList
    table: product_list_view
    key: [productId]
    query:
      - types: [productCreated]
    states:
      - name: productId
        type: string
        required: true
      - name: name
        type: string
"#;
    let output = generate_source(source);

    let states = find(&output, "src/domains/catalog/states.rs").expect("states.rs");
    assert!(states.contains("impl Default for ProductRegistry {"));
    assert!(states.contains("Self::new()"));

    let views = find(&output, "src/domains/catalog/views.rs").expect("views.rs");
    assert!(!views.contains("impl Default for ProductList"));
    assert!(!views.contains("pub fn new("));
    assert!(views.contains("pub const PRODUCT_LIST_VIEW: ViewDefinition"));
    assert!(views.contains("key: &[\"product_id\"]"));
}

#[test]
fn generates_view_migrations() {
    let source = r#"
name: Migrations
domains:
  - name: catalog
types:
  - alias: ProductId
    of: string
events:
  - name: productCreated
    fields:
      - name: productId
        type: string
        required: true
        tag: product
slices:
  - name: listProducts
    domain: catalog
    lanes:
      - type: Event
        cards: [productCreated]
      - type: View
        cards: [productList]
views:
  - name: productList
    table: product_list_view
    key: [productId]
    indexes:
      - columns: [name]
    query:
      - types: [productCreated]
    states:
      - name: productId
        type: productId
        required: true
      - name: name
        type: string
        required: true
      - name: price
        type: float
        required: true
"#;
    let output = generate_source(source);

    assert_eq!(output.migrations.len(), 1);
    let migration = &output.migrations[0];
    let path = migration.path.to_string_lossy();
    assert!(
        path.ends_with("_catalog_product_list_view.sql"),
        "unexpected migration path: {path}"
    );
    assert!(
        migration
            .contents
            .starts_with("-- Generated by `em-codegen`")
    );
    assert!(
        migration
            .contents
            .contains("CREATE TABLE IF NOT EXISTS product_list_view")
    );
    assert!(migration.contents.contains("product_id TEXT NOT NULL"));
    assert!(
        migration
            .contents
            .contains("price DOUBLE PRECISION NOT NULL")
    );
    assert!(migration.contents.contains("PRIMARY KEY (product_id)"));
    assert!(
        migration
            .contents
            .contains("last_event_position BIGINT NOT NULL DEFAULT 0")
    );
    assert!(migration.contents.contains(
        "CREATE INDEX IF NOT EXISTS idx_product_list_view_name ON product_list_view (name);"
    ));
}

#[test]
fn separate_states_and_views_can_share_a_name() {
    let source = r#"
name: SameName
domains:
  - name: orders
slices:
  - name: listOrders
    domain: orders
    lanes:
      - type: State
        cards: [orders]
      - type: View
        cards: [orders]
states:
  - name: orders
    params:
      - name: accountId
        type: string
        required: true
    states:
      - name: count
        type: integer
views:
  - name: orders
    key: [accountId]
    params:
      - name: accountId
        type: string
        required: true
    states:
      - name: count
        type: integer
"#;
    let output = generate_source(source);

    let states = find(&output, "src/domains/orders/states.rs").expect("states.rs");
    assert!(states.contains("pub struct Orders {"));
    assert!(!states.contains("pub struct OrdersParams"));

    let views = find(&output, "src/domains/orders/views.rs").expect("views.rs");
    assert!(views.contains("pub struct Orders {"));
    assert!(!views.contains("pub struct OrdersParams"));

    let domain_mod = find(&output, "src/domains/orders/mod.rs").expect("domain mod");
    assert_eq!(
        domain_mod.matches("Orders;").count(),
        1,
        "the duplicate name is re-exported once: {domain_mod}"
    );
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

fn generate_with_domain(source: &str, domain: &str) -> GeneratedOutput {
    let loaded = em_codegen_core::model::parse_spec(source, "test.spec.yaml").expect("spec parses");
    let options = GenerateOptions {
        domain: Some(domain.to_string()),
        ..GenerateOptions::default()
    };
    RustGenerator
        .generate(&loaded.model, &options)
        .expect("generation succeeds")
}

#[test]
fn generates_only_the_requested_domain() {
    let loaded = em_codegen_core::model::load_spec(sample_path()).expect("sample parses");
    let options = GenerateOptions {
        domain: Some("account".into()),
        ..GenerateOptions::default()
    };
    let output = RustGenerator
        .generate(&loaded.model, &options)
        .expect("generation succeeds");

    assert_eq!(output.package_name, "authentication_account");
    for path in [
        "src/commands.rs",
        "src/events.rs",
        "src/queries.rs",
        "src/services.rs",
        "src/states.rs",
        "src/types.rs",
        "src/action.rs",
        "src/actors.rs",
    ] {
        assert!(find(&output, path).is_some(), "missing {path}");
    }
    for path in [
        "src/domain_event.rs",
        "src/domains/mod.rs",
        "src/domains/account/mod.rs",
        "src/domains/account/commands.rs",
        "src/domains/totp/types.rs",
        "src/domains/recovery_codes/types.rs",
        "src/domains/passkey/types.rs",
        "src/domains/two_factor/types.rs",
        "src/domains/password/types.rs",
        "src/domains/session/types.rs",
    ] {
        assert!(find(&output, path).is_none(), "unexpected {path}");
    }

    let lib = find(&output, "src/lib.rs").unwrap();
    assert!(lib.contains("pub mod commands;"));
    assert!(lib.contains("pub mod types;"));
    assert!(!lib.contains("pub mod domains;"));
    assert!(!lib.contains("pub mod views;"));
    assert!(lib.contains("contains the `account` domain only"));
    assert!(lib.contains("The crate contains 1 domain module,"));
}

#[test]
fn a_filtered_domain_with_views_gets_a_root_views_module() {
    let source = r#"
name: Projections
domains:
  - name: orders
types:
  - alias: OrderId
    of: string
events:
  - name: orderPlaced
    fields:
      - name: orderId
        type: string
        required: true
slices:
  - name: placeOrder
    domain: orders
    lanes:
      - type: Event
        cards: [orderPlaced]
      - type: View
        cards: [orderList]
views:
  - name: orderList
    table: order_list_view
    key: [orderId]
    params:
      - name: orderId
        type: string
        required: true
    query:
      - types: [orderPlaced]
    states:
      - name: count
        type: integer
"#;
    let output = generate_with_domain(source, "orders");

    assert!(find(&output, "src/views.rs").is_some());
    let lib = find(&output, "src/lib.rs").unwrap();
    assert!(lib.contains("pub mod views;"));
    assert!(!lib.contains("pub mod domains;"));
}

#[test]
fn a_filtered_crate_pulls_cross_domain_dependencies_into_shared() {
    let source = r#"
name: Warehouse
domains:
  - name: orders
    groups: [orderTypes, orderStates]
    slices: [placeOrder]
  - name: inventory
    groups: [inventoryTypes]
types:
  - alias: OrderId
    of: string
  - alias: Sku
    of: string
  - object: OrderLine
    fields:
      - name: sku
        type: Sku
        required: true
  - object: InventoryLevel
    fields:
      - name: sku
        type: Sku
        required: true
      - name: quantity
        type: integer
        required: true
events:
  - name: orderPlaced
    fields:
      - name: orderId
        type: OrderId
        required: true
      - name: lines
        type: OrderLine
        array: true
        required: true
  - name: inventoryAdjusted
    fields:
      - name: sku
        type: Sku
        required: true
states:
  - name: orderRegistry
    params:
      - name: orderId
        type: OrderId
        required: true
    query:
      - types: [orderPlaced, inventoryAdjusted]
    states:
      - name: lastSku
        type: Sku
        required: false
commands:
  - name: placeOrder
    inputs:
      - name: orderId
        type: OrderId
        required: true
slices:
  - name: placeOrder
    domain: orders
    lanes:
      - type: Command
        cards: [placeOrder]
      - type: Event
        cards: [orderPlaced]
      - type: State
        cards: [orderRegistry]
groups:
  - name: orderTypes
    domain: orders
    cards: [OrderId, OrderLine]
  - name: orderStates
    domain: orders
    cards: [orderRegistry]
  - name: inventoryTypes
    domain: inventory
    cards: [Sku, InventoryLevel]
"#;
    let output = generate_with_domain(source, "orders");

    assert_eq!(output.package_name, "warehouse_orders");
    assert!(find(&output, "src/types.rs").is_some());
    assert!(find(&output, "src/states.rs").is_some());
    assert!(
        find(&output, "src/domains/mod.rs").is_none(),
        "the selected domain is not nested under domains/"
    );
    assert!(
        find(&output, "src/domains/inventory/mod.rs").is_none(),
        "other domains are not generated"
    );

    let states = find(&output, "src/states.rs").unwrap();
    assert!(states.contains("pub last_sku: Option<crate::shared::types::Sku>"));
    assert!(states.contains("event: &crate::shared::events::InventoryAdjusted"));

    let shared_types = find(&output, "src/shared/types.rs").expect("shared types");
    assert!(shared_types.contains("pub struct Sku(pub String)"));

    let shared_events = find(&output, "src/shared/events.rs").expect("shared events");
    assert!(shared_events.contains("pub struct InventoryAdjusted {"));

    let lib = find(&output, "src/lib.rs").unwrap();
    assert!(lib.contains("pub mod shared;"));
}

#[test]
fn a_filtered_crate_can_override_its_name() {
    let loaded = em_codegen_core::model::load_spec(sample_path()).expect("sample parses");
    let options = GenerateOptions {
        crate_name: Some("billing".into()),
        domain: Some("account".into()),
        ..GenerateOptions::default()
    };
    let output = RustGenerator
        .generate(&loaded.model, &options)
        .expect("generation succeeds");

    assert_eq!(output.package_name, "billing");
}

#[test]
fn unknown_domains_are_rejected() {
    let loaded = em_codegen_core::model::load_spec(sample_path()).expect("sample parses");
    let options = GenerateOptions {
        domain: Some("missing".into()),
        ..GenerateOptions::default()
    };
    let error = RustGenerator
        .generate(&loaded.model, &options)
        .expect_err("unknown domains fail");

    assert!(matches!(
        error,
        em_codegen_core::CodegenError::UnknownDomain { .. }
    ));
    assert!(error.to_string().contains("available: account"));
}

#[test]
fn numeric_ranges_match_the_field_type() {
    let source = r#"
name: Pricing
domains:
  - name: catalog
    groups: [catalogTypes]
    slices: [setPrice]
groups:
  - name: catalogTypes
    domain: catalog
    cards: [Price, Discount]
types:
  - alias: Price
    of: number
    validation:
      min: 0
      max: 100.5
  - alias: Discount
    of: number
    validation:
      min: 0.5
commands:
  - name: setPrice
    inputs:
      - name: price
        type: number
        required: true
        validation:
          min: 0
          max: 99
      - name: discount
        type: Discount
        required: true
      - name: quantity
        type: integer
        required: true
        validation:
          min: 1
          max: 10
slices:
  - name: setPrice
    domain: catalog
    lanes:
      - type: Command
        cards: [setPrice]
"#;
    let output = generate_source(source);

    let commands = find(&output, "src/domains/catalog/commands.rs").unwrap();
    assert!(
        commands.contains("#[validate(range(min = 0.0, max = 99.0))]"),
        "float bounds must be f64 literals: {commands}"
    );
    assert!(
        commands.contains("#[validate(range(min = 1, max = 10))]"),
        "integer bounds must stay integers: {commands}"
    );
    assert!(commands.contains(
        "validator::ValidateRange::validate_range(&value.0, Some(0.5), None, None, None)"
    ));
}
