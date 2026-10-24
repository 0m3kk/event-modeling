use std::path::PathBuf;

use em_codegen_core::model::{Model, parse_spec};

fn sample_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples/authentication.spec.yaml")
}

#[test]
fn normalises_the_authentication_sample() {
    let loaded = em_codegen_core::model::load_spec(sample_path()).expect("sample parses");
    let model = &loaded.model;

    assert_eq!(model.name, "Authentication");
    assert_eq!(model.types.len(), 27);
    assert_eq!(model.events.len(), 29);
    assert_eq!(model.commands.len(), 25);
    assert_eq!(model.queries.len(), 2);
    assert_eq!(model.states.len(), 16);
    assert_eq!(
        model.services.len(),
        11,
        "duplicate verifyRegistration is dropped"
    );
    assert_eq!(model.actors.len(), 4);
    assert_eq!(model.constraints.len(), 23);
    assert_eq!(model.tags.len(), 5);
    assert_eq!(model.slices.len(), 27);
    assert_eq!(model.domains.len(), 7);

    let warnings = loaded.warnings().join("\n");
    assert!(
        warnings.contains("recoveryCodesGenerated"),
        "half-filled field is reported: {warnings}"
    );
    assert!(
        warnings.contains("duplicate service method `verifyRegistration`"),
        "duplicate service method is reported: {warnings}"
    );

    let account_tag = model
        .tags
        .iter()
        .find(|tag| tag.tag == "account")
        .expect("account tag");
    assert!(
        account_tag
            .from_events
            .iter()
            .any(|event| event == "accountRegistered"),
        "fromEvents is parsed: {:?}",
        account_tag.from_events
    );
}

#[test]
fn assigns_cards_to_domains_from_groups_and_slices() {
    let loaded = em_codegen_core::model::load_spec(sample_path()).expect("sample parses");
    let model = &loaded.model;

    let email = model.find_type("email").expect("email type");
    assert_eq!(email.domain(), Some("identity"));

    let registration = model
        .events
        .iter()
        .find(|event| event.name == "accountRegistered")
        .expect("accountRegistered event");
    assert_eq!(registration.domain.as_deref(), Some("identity"));
    assert!(
        registration
            .used_in_slices
            .iter()
            .any(|slice| slice == "registerAccount")
    );

    let state = model
        .states
        .iter()
        .find(|state| state.name == "secondFactorEnrollment")
        .expect("secondFactorEnrollment state");
    assert_eq!(state.domain.as_deref(), Some("twoFactor"));

    let command = model
        .commands
        .iter()
        .find(|command| command.name == "createSession")
        .expect("createSession command");
    assert_eq!(command.domain.as_deref(), Some("session"));

    let recovery = model
        .domains
        .iter()
        .find(|domain| domain.name == "recoveryCodes")
        .expect("recoveryCodes domain");
    assert_eq!(recovery.module, "recovery_codes");
}

#[test]
fn assigns_service_methods_to_the_first_slice_domain() {
    let loaded = em_codegen_core::model::load_spec(sample_path()).expect("sample parses");
    let model = &loaded.model;

    let service = |name: &str| {
        model
            .services
            .iter()
            .find(|service| service.name == name)
            .unwrap_or_else(|| panic!("service `{name}`"))
    };

    assert_eq!(
        service("sendActivationEmail").domain.as_deref(),
        Some("identity")
    );
    assert_eq!(
        service("sendPasswordResetEmail").domain.as_deref(),
        Some("password")
    );
    assert_eq!(
        service("buildCreationOptions").domain.as_deref(),
        Some("passkey")
    );
    assert_eq!(
        service("storeRequestOptions").domain.as_deref(),
        Some("passkey")
    );
}

#[test]
fn hoists_inline_types_and_skips_empty_fields() {
    let source = r#"
name: Inline
types:
  - object: Profile
    fields:
      - name: id
        type:
          alias: AccountId
          of: string
      - name:
        type:
events:
  - name: ProfileCreated
    fields:
      - name: profile
        type: Profile
"#;
    let loaded = parse_spec(source, "inline.spec.yaml").expect("inline spec parses");
    let model: &Model = &loaded.model;

    assert!(
        model.types.iter().any(|ty| ty.name() == "AccountId"),
        "inline alias is hoisted into the types registry"
    );
    let profile = model
        .types
        .iter()
        .find(|ty| ty.name() == "Profile")
        .expect("Profile type");
    match profile {
        em_codegen_core::model::TypeModel::Object(object) => {
            assert_eq!(object.fields.len(), 1, "empty field is skipped");
            assert_eq!(object.fields[0].ty, "AccountId");
        }
        other => panic!("expected object, got {other:?}"),
    }
}

#[test]
fn creates_implicit_domains_for_undeclared_references() {
    let source = r#"
name: Implicit
groups:
  - name: billingTypes
    domain: billing
    cards: [InvoiceId]
types:
  - alias: InvoiceId
    of: string
slices:
  - name: payInvoice
    domain: billing
    lanes:
      - type: Command
        cards: [payInvoice]
commands:
  - name: payInvoice
    inputs:
      - name: invoiceId
        type: InvoiceId
        required: true
"#;
    let loaded = parse_spec(source, "implicit.spec.yaml").expect("implicit spec parses");
    let model = &loaded.model;

    assert_eq!(model.domains.len(), 1);
    assert_eq!(model.domains[0].name, "billing");
    assert!(
        model
            .warnings
            .iter()
            .any(|warning| warning.contains("domain `billing` is referenced but not declared"))
    );
}
