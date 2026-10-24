//! Builds the serialisable view model consumed by the Rust templates.
//!
//! Output layout:
//!
//! ```text
//! src/
//!   lib.rs
//!   actors.rs
//!   domain_event.rs        # DomainEvent trait
//!   domains/
//!     identity/
//!       mod.rs
//!       commands.rs
//!       events.rs
//!       queries.rs
//!       services.rs
//!       states.rs
//!       types.rs
//!   shared/                # only when items are not assigned to a domain
//! ```
//!
//! Every language decision (casing, keyword escaping, scalar mapping, optional
//! wrapping, cross-domain paths, dependency detection) lives here so the
//! templates stay readable and easy to customise.

use std::collections::{BTreeMap, HashSet};

use em_codegen_core::generator::GenerateOptions;
use em_codegen_core::model::{
    ActorModel, AliasModel, CommandModel, EnumModel, EventModel, FieldModel, Model, ObjectModel,
    QueryModel, QuerySourceModel, ServiceModel, StateModel, TypeModel,
};
use em_codegen_core::{naming, spec};
use serde::Serialize;

const RUST_KEYWORDS: &[&str] = &[
    "as", "break", "const", "continue", "crate", "else", "enum", "extern", "false", "fn", "for",
    "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref", "return",
    "self", "Self", "static", "struct", "super", "trait", "true", "type", "unsafe", "use", "where",
    "while", "async", "await", "dyn", "abstract", "become", "box", "do", "final", "macro",
    "override", "priv", "try", "typeof", "unsized", "virtual", "yield", "gen",
];

/// The complete template context for one spec.
#[derive(Debug, Serialize)]
pub struct CrateCtx {
    pub spec_name: String,
    pub package_name: String,
    pub version: String,
    pub package_description: String,
    pub generator_version: String,
    pub domains: Vec<DomainCtx>,
    pub shared: Option<DomainCtx>,
    pub has_shared: bool,
    pub actors: Vec<ActorCtx>,
    pub uses_json: bool,
    pub uses_chrono: bool,
    pub uses_uuid: bool,
    pub uses_regex: bool,
    pub counts: CountsCtx,
}

#[derive(Debug, Serialize)]
pub struct CountsCtx {
    pub domains: usize,
    pub types: usize,
    pub events: usize,
    pub commands: usize,
    pub queries: usize,
    pub states: usize,
    pub services: usize,
    pub actors: usize,
    pub tags: usize,
}

/// One domain module, or the synthetic `shared` module.
#[derive(Debug, Serialize)]
pub struct DomainCtx {
    /// Domain name (or `shared`).
    pub name: String,
    /// Directory/file name, without `r#`.
    pub module: String,
    /// Identifier used after `mod`, possibly a raw identifier.
    pub module_ident: String,
    pub types: Vec<TypeCtx>,
    pub events: Vec<EventCtx>,
    pub commands: Vec<CommandCtx>,
    pub queries: Vec<QueryCtx>,
    pub states: Vec<StateCtx>,
    pub services: Vec<ServiceCtx>,
    pub command_regexes: Vec<RegexCtx>,
    pub query_regexes: Vec<RegexCtx>,
    pub command_validators: Vec<ValidatorFnCtx>,
    pub query_validators: Vec<ValidatorFnCtx>,
    pub pub_uses: Vec<PubUseCtx>,
}

#[derive(Debug, Serialize)]
pub struct PubUseCtx {
    /// Submodule inside the domain, e.g. `events`.
    pub module: String,
    pub rust_name: String,
}

#[derive(Debug, Serialize)]
pub struct TypeCtx {
    /// `object`, `enum` or `alias`.
    pub kind: &'static str,
    pub name: String,
    pub rust_name: String,
    pub description: Option<String>,
    pub doc_lines: Vec<String>,
    pub fields: Vec<FieldCtx>,
    pub variants: Vec<VariantCtx>,
    pub alias: Option<AliasCtx>,
}

#[derive(Debug, Serialize)]
pub struct AliasCtx {
    pub inner_rust: String,
    pub eq_hash: bool,
    pub display: bool,
    pub string_like: bool,
}

#[derive(Debug, Serialize)]
pub struct AliasCheckCtx {
    /// Boolean expression that returns `true` when the value is valid.
    pub expression: String,
    /// Validator error code, e.g. `length` or `email`.
    pub code: String,
}

#[derive(Debug, Serialize)]
pub struct ValidatorFnCtx {
    pub name: String,
    pub parameter_type: String,
    pub optional: bool,
    pub array: bool,
    pub checks: Vec<AliasCheckCtx>,
}

#[derive(Debug, Serialize)]
pub struct RegexCtx {
    /// Static name inside the module that uses it.
    pub name: String,
    pub pattern: String,
}

#[derive(Debug, Serialize)]
pub struct VariantCtx {
    pub name: String,
    pub rust_name: String,
    pub description: Option<String>,
    pub doc_lines: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct FieldCtx {
    pub name: String,
    pub rust_name: String,
    /// Full Rust type, e.g. `Option<Vec<SessionId>>`.
    pub rtype: String,
    /// Inner Rust type without optional/array wrapping.
    pub base_rust: String,
    pub array: bool,
    pub required: bool,
    pub tag: Option<String>,
    pub description: Option<String>,
    pub doc_lines: Vec<String>,
    pub validation_notes: Vec<String>,
    /// Validator rules rendered inside `#[validate(...)]`.
    pub validation_attrs: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct EventCtx {
    pub name: String,
    pub rust_name: String,
    pub description: Option<String>,
    pub doc_lines: Vec<String>,
    pub used_in_slices: Vec<String>,
    pub fields: Vec<FieldCtx>,
    /// Tagged fields, used to implement `DomainEvent::tags`.
    pub tag_exprs: Vec<TagExprCtx>,
}

#[derive(Debug, Serialize)]
pub struct TagExprCtx {
    pub tag: String,
    pub field: String,
    pub optional: bool,
    pub array: bool,
}

#[derive(Debug, Serialize)]
pub struct CommandCtx {
    pub name: String,
    pub rust_name: String,
    pub response_name: String,
    /// Permission required to execute the command, normalised to snake_case.
    pub action: Option<String>,
    pub description: Option<String>,
    pub doc_lines: Vec<String>,
    pub used_in_slices: Vec<String>,
    pub inputs: Vec<FieldCtx>,
    pub responses: Vec<FieldCtx>,
}

#[derive(Debug, Serialize)]
pub struct QueryCtx {
    pub name: String,
    pub rust_name: String,
    pub params_name: String,
    pub response_name: String,
    /// Permission required to execute the query, normalised to snake_case.
    pub action: Option<String>,
    pub description: Option<String>,
    pub doc_lines: Vec<String>,
    pub used_in_slices: Vec<String>,
    pub params: Vec<FieldCtx>,
    pub responses: Vec<FieldCtx>,
}

#[derive(Debug, Serialize)]
pub struct StateCtx {
    pub name: String,
    pub rust_name: String,
    pub params_name: String,
    pub description: Option<String>,
    pub doc_lines: Vec<String>,
    pub used_in_slices: Vec<String>,
    pub params: Vec<FieldCtx>,
    pub states: Vec<FieldCtx>,
    pub query: Vec<QuerySourceCtx>,
}

#[derive(Debug, Serialize)]
pub struct QuerySourceCtx {
    pub types: Vec<String>,
    pub tags: Vec<QueryTagCtx>,
    pub description: Option<String>,
    pub doc_lines: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct QueryTagCtx {
    pub tag: String,
    pub field: String,
}

#[derive(Debug, Serialize)]
pub struct ServiceCtx {
    pub name: String,
    pub trait_name: String,
    pub methods: Vec<ServiceMethodCtx>,
}

#[derive(Debug, Serialize)]
pub struct ServiceMethodCtx {
    pub name: String,
    pub rust_name: String,
    pub params_name: String,
    pub returns_name: String,
    pub description: Option<String>,
    pub doc_lines: Vec<String>,
    pub used_in_slices: Vec<String>,
    pub params: Vec<FieldCtx>,
    pub returns: Vec<FieldCtx>,
    pub has_returns: bool,
}

#[derive(Debug, Serialize)]
pub struct ActorCtx {
    pub name: String,
    pub rust_name: String,
    pub description: Option<String>,
    pub doc_lines: Vec<String>,
    pub permissions: Vec<String>,
}

/// Builds the context and returns any non-fatal warnings discovered on the way.
pub fn build(model: &Model, options: &GenerateOptions) -> (CrateCtx, Vec<String>) {
    let mut warnings = Vec::new();
    let mut deps = Dependencies::default();
    let resolver = TypeResolver::new(model);

    let defs: BTreeMap<String, &TypeModel> = model
        .types
        .iter()
        .map(|ty| (naming::name_key(ty.name()), ty))
        .collect();

    let mut domains = Vec::new();
    for domain in &model.domains {
        let scope_key = naming::name_key(&domain.name);
        let type_scope = Scope::Domain(&scope_key);
        let item_scope = Scope::Qualified;
        let mut command_regexes = RegexRegistry::default();
        let mut query_regexes = RegexRegistry::default();
        let mut command_validators = ValidatorRegistry::default();
        let mut query_validators = ValidatorRegistry::default();

        let types: Vec<TypeCtx> = model
            .types
            .iter()
            .filter(|ty| ty.domain() == Some(domain.name.as_str()))
            .map(|ty| build_type(ty, &defs, type_scope, &resolver, &mut deps, &mut warnings))
            .collect();
        let events: Vec<EventCtx> = model
            .events
            .iter()
            .filter(|event| event.domain.as_deref() == Some(domain.name.as_str()))
            .map(|event| {
                build_event(
                    event,
                    &defs,
                    item_scope,
                    &resolver,
                    &mut deps,
                    &mut warnings,
                )
            })
            .collect();
        let commands: Vec<CommandCtx> = model
            .commands
            .iter()
            .filter(|command| command.domain.as_deref() == Some(domain.name.as_str()))
            .map(|command| {
                build_command(
                    command,
                    &defs,
                    item_scope,
                    &resolver,
                    &mut deps,
                    &mut command_regexes,
                    &mut command_validators,
                    &mut warnings,
                )
            })
            .collect();
        let queries: Vec<QueryCtx> = model
            .queries
            .iter()
            .filter(|query| query.domain.as_deref() == Some(domain.name.as_str()))
            .map(|query| {
                build_query(
                    query,
                    &defs,
                    item_scope,
                    &resolver,
                    &mut deps,
                    &mut query_regexes,
                    &mut query_validators,
                    &mut warnings,
                )
            })
            .collect();
        let states: Vec<StateCtx> = model
            .states
            .iter()
            .filter(|state| state.domain.as_deref() == Some(domain.name.as_str()))
            .map(|state| {
                build_state(
                    state,
                    &defs,
                    item_scope,
                    &resolver,
                    &mut deps,
                    &mut warnings,
                )
            })
            .collect();
        let domain_services: Vec<&ServiceModel> = model
            .services
            .iter()
            .filter(|service| service.domain.as_deref() == Some(domain.name.as_str()))
            .collect();
        let services = build_services(
            model,
            &domain_services,
            &defs,
            item_scope,
            &resolver,
            &mut deps,
            &mut warnings,
        );

        let (module, module_ident) = module_names(&domain.name);
        let pub_uses = build_pub_uses(&types, &events, &commands, &queries, &states, &services);

        domains.push(DomainCtx {
            name: domain.name.clone(),
            module,
            module_ident,
            types,
            events,
            commands,
            queries,
            states,
            services,
            command_regexes: command_regexes.entries,
            query_regexes: query_regexes.entries,
            command_validators: command_validators.entries,
            query_validators: query_validators.entries,
            pub_uses,
        });
    }

    let shared_types: Vec<&TypeModel> = model
        .types
        .iter()
        .filter(|ty| ty.domain().is_none())
        .collect();
    let shared_events: Vec<&EventModel> = model
        .events
        .iter()
        .filter(|event| event.domain.is_none())
        .collect();
    let shared_commands: Vec<&CommandModel> = model
        .commands
        .iter()
        .filter(|command| command.domain.is_none())
        .collect();
    let shared_queries: Vec<&QueryModel> = model
        .queries
        .iter()
        .filter(|query| query.domain.is_none())
        .collect();
    let shared_states: Vec<&StateModel> = model
        .states
        .iter()
        .filter(|state| state.domain.is_none())
        .collect();
    let shared_services: Vec<&ServiceModel> = model
        .services
        .iter()
        .filter(|service| service.domain.is_none())
        .collect();

    let has_shared = !shared_types.is_empty()
        || !shared_events.is_empty()
        || !shared_commands.is_empty()
        || !shared_queries.is_empty()
        || !shared_states.is_empty()
        || !shared_services.is_empty();

    let shared = if has_shared {
        let type_scope = Scope::Shared;
        let item_scope = Scope::Qualified;
        let mut command_regexes = RegexRegistry::default();
        let mut query_regexes = RegexRegistry::default();
        let mut command_validators = ValidatorRegistry::default();
        let mut query_validators = ValidatorRegistry::default();
        let types: Vec<TypeCtx> = shared_types
            .iter()
            .map(|ty| build_type(ty, &defs, type_scope, &resolver, &mut deps, &mut warnings))
            .collect();
        let events: Vec<EventCtx> = shared_events
            .iter()
            .map(|event| {
                build_event(
                    event,
                    &defs,
                    item_scope,
                    &resolver,
                    &mut deps,
                    &mut warnings,
                )
            })
            .collect();
        let commands: Vec<CommandCtx> = shared_commands
            .iter()
            .map(|command| {
                build_command(
                    command,
                    &defs,
                    item_scope,
                    &resolver,
                    &mut deps,
                    &mut command_regexes,
                    &mut command_validators,
                    &mut warnings,
                )
            })
            .collect();
        let queries: Vec<QueryCtx> = shared_queries
            .iter()
            .map(|query| {
                build_query(
                    query,
                    &defs,
                    item_scope,
                    &resolver,
                    &mut deps,
                    &mut query_regexes,
                    &mut query_validators,
                    &mut warnings,
                )
            })
            .collect();
        let states: Vec<StateCtx> = shared_states
            .iter()
            .map(|state| {
                build_state(
                    state,
                    &defs,
                    item_scope,
                    &resolver,
                    &mut deps,
                    &mut warnings,
                )
            })
            .collect();
        let services = build_services(
            model,
            &shared_services,
            &defs,
            item_scope,
            &resolver,
            &mut deps,
            &mut warnings,
        );
        let pub_uses = build_pub_uses(&types, &events, &commands, &queries, &states, &services);

        Some(DomainCtx {
            name: "shared".into(),
            module: "shared".into(),
            module_ident: "shared".into(),
            types,
            events,
            commands,
            queries,
            states,
            services,
            command_regexes: command_regexes.entries,
            query_regexes: query_regexes.entries,
            command_validators: command_validators.entries,
            query_validators: query_validators.entries,
            pub_uses,
        })
    } else {
        None
    };

    let uses_regex = domains
        .iter()
        .chain(shared.iter())
        .any(|domain| !domain.command_regexes.is_empty() || !domain.query_regexes.is_empty());

    let actors = build_actors(model);

    let package_name = package_name(model, options);
    let description = format!(
        "Generated Rust crate for the `{}` event-modeling specification.",
        model.name
    );

    let context = CrateCtx {
        spec_name: model.name.clone(),
        package_name,
        version: options.version.clone(),
        package_description: description,
        generator_version: env!("CARGO_PKG_VERSION").to_string(),
        counts: CountsCtx {
            domains: domains.len(),
            types: model.types.len(),
            events: model.events.len(),
            commands: model.commands.len(),
            queries: model.queries.len(),
            states: model.states.len(),
            services: model.services.len(),
            actors: actors.len(),
            tags: model.tags.len(),
        },
        domains,
        shared,
        has_shared,
        actors,
        uses_json: true,
        uses_chrono: deps.chrono,
        uses_uuid: deps.uuid,
        uses_regex,
    };

    (context, warnings)
}

fn build_pub_uses(
    types: &[TypeCtx],
    events: &[EventCtx],
    commands: &[CommandCtx],
    queries: &[QueryCtx],
    states: &[StateCtx],
    services: &[ServiceCtx],
) -> Vec<PubUseCtx> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let mut push = |module: &str, rust_name: &str| {
        if seen.insert(rust_name.to_string()) {
            out.push(PubUseCtx {
                module: module.to_string(),
                rust_name: rust_name.to_string(),
            });
        }
    };

    for ty in types {
        push("types", &ty.rust_name);
    }
    for event in events {
        push("events", &event.rust_name);
    }
    for command in commands {
        push("commands", &command.rust_name);
        push("commands", &command.response_name);
    }
    for query in queries {
        push("queries", &query.params_name);
        push("queries", &query.response_name);
    }
    for state in states {
        push("states", &state.rust_name);
        push("states", &state.params_name);
    }
    for service in services {
        push("services", &service.trait_name);
        for method in &service.methods {
            push("services", &method.params_name);
            push("services", &method.returns_name);
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

fn build_type(
    ty: &TypeModel,
    defs: &BTreeMap<String, &TypeModel>,
    scope: Scope<'_>,
    resolver: &TypeResolver,
    deps: &mut Dependencies,
    warnings: &mut Vec<String>,
) -> TypeCtx {
    match ty {
        TypeModel::Object(object) => build_object(object, defs, scope, resolver, deps, warnings),
        TypeModel::Enum(enumeration) => build_enum(enumeration),
        TypeModel::Alias(alias) => build_alias(alias, defs, scope, resolver, deps, warnings),
    }
}

fn build_object(
    object: &ObjectModel,
    defs: &BTreeMap<String, &TypeModel>,
    scope: Scope<'_>,
    resolver: &TypeResolver,
    deps: &mut Dependencies,
    warnings: &mut Vec<String>,
) -> TypeCtx {
    let owner = format!("object `{}`", object.name);
    TypeCtx {
        kind: "object",
        name: object.name.clone(),
        rust_name: type_ident(&object.name),
        description: object.description.clone(),
        doc_lines: doc_lines(object.description.as_deref()),
        fields: object
            .fields
            .iter()
            .map(|field| build_field(field, &owner, defs, scope, resolver, deps, None, warnings))
            .collect(),
        variants: Vec::new(),
        alias: None,
    }
}

fn build_enum(enumeration: &EnumModel) -> TypeCtx {
    TypeCtx {
        kind: "enum",
        name: enumeration.name.clone(),
        rust_name: type_ident(&enumeration.name),
        description: enumeration.description.clone(),
        doc_lines: doc_lines(enumeration.description.as_deref()),
        fields: Vec::new(),
        variants: enumeration
            .values
            .iter()
            .map(|value| VariantCtx {
                name: value.name.clone(),
                rust_name: variant_ident(&value.name),
                description: value.description.clone(),
                doc_lines: doc_lines(value.description.as_deref()),
            })
            .collect(),
        alias: None,
    }
}

fn build_alias(
    alias: &AliasModel,
    defs: &BTreeMap<String, &TypeModel>,
    scope: Scope<'_>,
    resolver: &TypeResolver,
    deps: &mut Dependencies,
    warnings: &mut Vec<String>,
) -> TypeCtx {
    let validation = alias.validation.as_ref();
    let mut base = base_type(&alias.of, scope, resolver);
    base = apply_format_override(base, validation);

    if base.kind == BaseKind::Named && !defs.contains_key(&naming::name_key(&alias.of)) {
        warnings.push(format!(
            "alias `{}`: base type `{}` is not declared; referencing it as a generated type",
            alias.name, alias.of
        ));
    }
    deps.note(base.kind);

    let inner_rust = if alias.array {
        format!("Vec<{}>", base.rust)
    } else {
        base.rust.clone()
    };

    TypeCtx {
        kind: "alias",
        name: alias.name.clone(),
        rust_name: type_ident(&alias.name),
        description: alias.description.clone(),
        doc_lines: doc_lines(alias.description.as_deref()),
        fields: Vec::new(),
        variants: Vec::new(),
        alias: Some(AliasCtx {
            inner_rust,
            eq_hash: !alias.array
                && matches!(
                    base.kind,
                    BaseKind::String
                        | BaseKind::I64
                        | BaseKind::Bool
                        | BaseKind::Uuid
                        | BaseKind::Date
                        | BaseKind::Time
                ),
            display: !alias.array
                && matches!(
                    base.kind,
                    BaseKind::String
                        | BaseKind::I64
                        | BaseKind::F64
                        | BaseKind::Bool
                        | BaseKind::Uuid
                        | BaseKind::Date
                        | BaseKind::Time
                        | BaseKind::DateTime
                ),
            string_like: !alias.array && base.kind == BaseKind::String,
        }),
    }
}

// ---------------------------------------------------------------------------
// Other cards
// ---------------------------------------------------------------------------

fn build_event(
    event: &EventModel,
    defs: &BTreeMap<String, &TypeModel>,
    scope: Scope<'_>,
    resolver: &TypeResolver,
    deps: &mut Dependencies,
    warnings: &mut Vec<String>,
) -> EventCtx {
    let owner = format!("event `{}`", event.name);
    let docs = doc_lines(event.description.as_deref());
    EventCtx {
        name: event.name.clone(),
        rust_name: type_ident(&event.name),
        description: event.description.clone(),
        doc_lines: docs,
        used_in_slices: event.used_in_slices.clone(),
        fields: event
            .fields
            .iter()
            .map(|field| build_field(field, &owner, defs, scope, resolver, deps, None, warnings))
            .collect(),
        tag_exprs: event
            .fields
            .iter()
            .filter_map(|field| {
                field.tag.as_ref().map(|tag| TagExprCtx {
                    tag: naming::snake_case(tag),
                    field: field_ident(&field.name),
                    optional: !field.required,
                    array: field.array,
                })
            })
            .collect(),
    }
}

fn build_command(
    command: &CommandModel,
    defs: &BTreeMap<String, &TypeModel>,
    scope: Scope<'_>,
    resolver: &TypeResolver,
    deps: &mut Dependencies,
    regexes: &mut RegexRegistry,
    validators: &mut ValidatorRegistry,
    warnings: &mut Vec<String>,
) -> CommandCtx {
    let owner = format!("command `{}`", command.name);
    let rust_name = type_ident(&command.name);
    let action = command.action.as_deref().map(snake_action);
    let mut docs = doc_lines(command.description.as_deref());
    if let Some(action) = &action {
        docs.push(format!("Action: `{action}`."));
    }
    let mut validation = ValidationCtx {
        regexes,
        validators,
    };
    let inputs = command
        .inputs
        .iter()
        .map(|field| {
            build_field(
                field,
                &owner,
                defs,
                scope,
                resolver,
                deps,
                Some(&mut validation),
                warnings,
            )
        })
        .collect();
    let responses = command
        .responses
        .iter()
        .map(|field| {
            build_field(
                field,
                &format!("{owner} response"),
                defs,
                scope,
                resolver,
                deps,
                None,
                warnings,
            )
        })
        .collect();

    CommandCtx {
        name: command.name.clone(),
        rust_name: rust_name.clone(),
        response_name: format!("{rust_name}Response"),
        action,
        description: command.description.clone(),
        doc_lines: docs,
        used_in_slices: command.used_in_slices.clone(),
        inputs,
        responses,
    }
}

fn build_query(
    query: &QueryModel,
    defs: &BTreeMap<String, &TypeModel>,
    scope: Scope<'_>,
    resolver: &TypeResolver,
    deps: &mut Dependencies,
    regexes: &mut RegexRegistry,
    validators: &mut ValidatorRegistry,
    warnings: &mut Vec<String>,
) -> QueryCtx {
    let owner = format!("query `{}`", query.name);
    let rust_name = type_ident(&query.name);
    let action = query.action.as_deref().map(snake_action);
    let mut docs = doc_lines(query.description.as_deref());
    if let Some(action) = &action {
        docs.push(format!("Action: `{action}`."));
    }
    let mut validation = ValidationCtx {
        regexes,
        validators,
    };
    let params = query
        .params
        .iter()
        .map(|field| {
            build_field(
                field,
                &owner,
                defs,
                scope,
                resolver,
                deps,
                Some(&mut validation),
                warnings,
            )
        })
        .collect();
    let responses = query
        .responses
        .iter()
        .map(|field| {
            build_field(
                field,
                &format!("{owner} response"),
                defs,
                scope,
                resolver,
                deps,
                None,
                warnings,
            )
        })
        .collect();

    QueryCtx {
        name: query.name.clone(),
        params_name: format!("{rust_name}Params"),
        response_name: format!("{rust_name}Response"),
        rust_name,
        action,
        description: query.description.clone(),
        doc_lines: docs,
        used_in_slices: query.used_in_slices.clone(),
        params,
        responses,
    }
}

fn build_state(
    state: &StateModel,
    defs: &BTreeMap<String, &TypeModel>,
    scope: Scope<'_>,
    resolver: &TypeResolver,
    deps: &mut Dependencies,
    warnings: &mut Vec<String>,
) -> StateCtx {
    let owner = format!("state `{}`", state.name);
    let rust_name = type_ident(&state.name);
    let docs = doc_lines(state.description.as_deref());
    StateCtx {
        name: state.name.clone(),
        params_name: format!("{rust_name}Params"),
        rust_name,
        description: state.description.clone(),
        doc_lines: docs,
        used_in_slices: state.used_in_slices.clone(),
        params: state
            .params
            .iter()
            .map(|field| build_field(field, &owner, defs, scope, resolver, deps, None, warnings))
            .collect(),
        states: state
            .states
            .iter()
            .map(|field| build_field(field, &owner, defs, scope, resolver, deps, None, warnings))
            .collect(),
        query: state.query.iter().map(build_query_source).collect(),
    }
}

fn build_query_source(source: &QuerySourceModel) -> QuerySourceCtx {
    let mut docs = doc_lines(source.description.as_deref());
    if !source.types.is_empty() {
        let types = source
            .types
            .iter()
            .map(|ty| naming::snake_case(ty))
            .collect::<Vec<_>>()
            .join(", ");
        docs.push(format!("Event types: {types}."));
    }
    if !source.tags.is_empty() {
        let tags = source
            .tags
            .iter()
            .map(|tag| {
                format!(
                    "`{}` = `{}`",
                    naming::snake_case(&tag.tag),
                    naming::snake_case(&tag.field)
                )
            })
            .collect::<Vec<_>>()
            .join(", ");
        docs.push(format!("Tags: {tags}."));
    }
    QuerySourceCtx {
        types: source.types.clone(),
        tags: source
            .tags
            .iter()
            .map(|tag| QueryTagCtx {
                tag: tag.tag.clone(),
                field: tag.field.clone(),
            })
            .collect(),
        description: source.description.clone(),
        doc_lines: docs,
    }
}

fn build_services(
    model: &Model,
    services: &[&ServiceModel],
    defs: &BTreeMap<String, &TypeModel>,
    scope: Scope<'_>,
    resolver: &TypeResolver,
    deps: &mut Dependencies,
    warnings: &mut Vec<String>,
) -> Vec<ServiceCtx> {
    let default_label = format!("{} services", model.name);
    let mut groups: Vec<ServiceCtx> = Vec::new();

    for service in services {
        let label = service
            .service_name
            .clone()
            .unwrap_or_else(|| default_label.clone());
        let trait_name = type_ident(&label);
        let index = match groups
            .iter()
            .position(|group| group.trait_name == trait_name)
        {
            Some(index) => index,
            None => {
                groups.push(ServiceCtx {
                    name: label,
                    trait_name: trait_name.clone(),
                    methods: Vec::new(),
                });
                groups.len() - 1
            }
        };

        let method = build_service_method(service, defs, scope, resolver, deps, warnings);
        groups[index].methods.push(method);
    }

    groups
}

fn build_service_method(
    service: &ServiceModel,
    defs: &BTreeMap<String, &TypeModel>,
    scope: Scope<'_>,
    resolver: &TypeResolver,
    deps: &mut Dependencies,
    warnings: &mut Vec<String>,
) -> ServiceMethodCtx {
    let owner = format!("service `{}`", service.name);
    let rust_name = field_ident(&service.name);
    let pascal = type_ident(&service.name);
    let docs = doc_lines(service.description.as_deref());
    ServiceMethodCtx {
        name: service.name.clone(),
        rust_name,
        params_name: format!("{pascal}Params"),
        returns_name: format!("{pascal}Returns"),
        description: service.description.clone(),
        doc_lines: docs,
        used_in_slices: service.used_in_slices.clone(),
        params: service
            .params
            .iter()
            .map(|field| build_field(field, &owner, defs, scope, resolver, deps, None, warnings))
            .collect(),
        returns: service
            .returns
            .iter()
            .map(|field| build_field(field, &owner, defs, scope, resolver, deps, None, warnings))
            .collect(),
        has_returns: !service.returns.is_empty(),
    }
}

fn build_actors(model: &Model) -> Vec<ActorCtx> {
    model
        .actors
        .iter()
        .map(|actor: &ActorModel| ActorCtx {
            name: actor.name.clone(),
            rust_name: type_ident(&actor.name),
            description: actor.description.clone(),
            doc_lines: doc_lines(actor.description.as_deref()),
            permissions: actor
                .permissions
                .iter()
                .map(|permission| snake_action(permission))
                .collect(),
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Cross-domain type paths
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy)]
enum Scope<'a> {
    Domain(&'a str),
    Shared,
    /// Fully qualify every named type (used outside `types.rs`).
    Qualified,
}

#[derive(Debug, Clone)]
enum TypeLocation {
    Domain { key: String, module: String },
    Shared,
}

struct TypeResolver {
    locations: BTreeMap<String, TypeLocation>,
}

impl TypeResolver {
    fn new(model: &Model) -> Self {
        let domain_modules: BTreeMap<String, String> = model
            .domains
            .iter()
            .map(|domain| (naming::name_key(&domain.name), module_names(&domain.name).1))
            .collect();

        let mut locations = BTreeMap::new();
        for ty in &model.types {
            let location = match ty.domain() {
                Some(domain) => {
                    let key = naming::name_key(domain);
                    match domain_modules.get(&key) {
                        Some(module) => TypeLocation::Domain {
                            key,
                            module: module.clone(),
                        },
                        None => TypeLocation::Shared,
                    }
                }
                None => TypeLocation::Shared,
            };
            locations.insert(naming::name_key(ty.name()), location);
        }

        Self { locations }
    }

    fn type_path(&self, name: &str, scope: Scope<'_>) -> String {
        let ident = type_ident(name);
        match self.locations.get(&naming::name_key(name)) {
            Some(TypeLocation::Domain { key, module }) => match scope {
                Scope::Domain(current) if current == key => ident,
                _ => format!("crate::domains::{module}::types::{ident}"),
            },
            Some(TypeLocation::Shared) => match scope {
                Scope::Shared => ident,
                _ => format!("crate::shared::types::{ident}"),
            },
            None => ident,
        }
    }
}

// ---------------------------------------------------------------------------
// Fields and scalar mapping
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
fn build_field(
    field: &FieldModel,
    owner: &str,
    defs: &BTreeMap<String, &TypeModel>,
    scope: Scope<'_>,
    resolver: &TypeResolver,
    deps: &mut Dependencies,
    validation: Option<&mut ValidationCtx<'_>>,
    warnings: &mut Vec<String>,
) -> FieldCtx {
    let base = field_base_type(field, scope, resolver);
    if base.kind == BaseKind::Named && !defs.contains_key(&naming::name_key(&field.ty)) {
        warnings.push(format!(
            "{owner}.{}: type `{}` is not declared; referencing it as a generated type",
            field.name, field.ty
        ));
    }
    deps.note(base.kind);

    let inner = if field.array {
        format!("Vec<{}>", base.rust)
    } else {
        base.rust.clone()
    };
    let rtype = if field.required {
        inner
    } else {
        format!("Option<{inner}>")
    };

    let validation_notes = validation_notes(field.validation.as_ref());
    let validation_attrs = match validation {
        Some(validation) => {
            field_validation_attrs(field, &base, &rtype, defs, resolver, validation)
        }
        None => Vec::new(),
    };
    let mut docs = doc_lines(field.description.as_deref());
    if let Some(tag) = &field.tag {
        docs.push(format!("Tag: `{}`.", naming::snake_case(tag)));
    }
    if !validation_notes.is_empty() {
        docs.push("Validation:".into());
        for note in &validation_notes {
            docs.push(format!("  - {note}"));
        }
    }

    FieldCtx {
        name: field.name.clone(),
        rust_name: field_ident(&field.name),
        rtype,
        base_rust: base.rust,
        array: field.array,
        required: field.required,
        tag: field.tag.clone(),
        description: field.description.clone(),
        doc_lines: docs,
        validation_notes,
        validation_attrs,
    }
}

/// Applies `format`-driven overrides (`uuid`, `date`, `time`, `date-time`).
fn field_base_type(field: &FieldModel, scope: Scope<'_>, resolver: &TypeResolver) -> BaseType {
    let base = base_type(&field.ty, scope, resolver);
    apply_format_override(base, field.validation.as_ref())
}

fn apply_format_override(
    mut base: BaseType,
    validation: Option<&spec::FieldValidation>,
) -> BaseType {
    if base.kind != BaseKind::String {
        return base;
    }
    let Some(format) = validation.and_then(|validation| validation.format.as_deref()) else {
        return base;
    };
    match format.to_ascii_lowercase().as_str() {
        "uuid" => base = BaseType::uuid(),
        "date" => base = BaseType::date(),
        "time" => base = BaseType::time(),
        "date-time" | "datetime" | "timestamp" => base = BaseType::datetime(),
        _ => {}
    }
    base
}

fn field_validation_attrs(
    field: &FieldModel,
    base: &BaseType,
    rtype: &str,
    defs: &BTreeMap<String, &TypeModel>,
    resolver: &TypeResolver,
    ctx: &mut ValidationCtx<'_>,
) -> Vec<String> {
    let alias = defs.get(&naming::name_key(&field.ty)).and_then(|ty| {
        let ty = *ty;
        match ty {
            TypeModel::Alias(alias) => Some(alias),
            _ => None,
        }
    });

    if let Some(alias) = alias {
        let alias_base = apply_format_override(
            base_type(&alias.of, Scope::Qualified, resolver),
            alias.validation.as_ref(),
        );
        let rules = alias_validation_rules(alias, &alias_base, ctx.regexes);
        if rules.is_empty() {
            return Vec::new();
        }
        let name = ctx.validators.register(
            &field.name,
            validator_parameter_type(rtype, field.required),
            !field.required,
            field.array,
            rules,
        );
        return vec![format!("custom(function = {})", string_literal(&name))];
    }

    let mut attrs = Vec::new();
    if let Some(validation) = field.validation.as_ref() {
        if field.array {
            if validation.min_items.is_some() || validation.max_items.is_some() {
                attrs.push(length_rule(validation.min_items, validation.max_items));
            }
        } else if base.kind == BaseKind::String {
            if validation.min_length.is_some() || validation.max_length.is_some() {
                attrs.push(length_rule(validation.min_length, validation.max_length));
            }
            match validation
                .format
                .as_deref()
                .map(|format| format.to_ascii_lowercase())
                .as_deref()
            {
                Some("email") => attrs.push("email".into()),
                Some("url") => attrs.push("url".into()),
                _ => {}
            }
            if let Some(pattern) = validation
                .pattern
                .as_deref()
                .filter(|pattern| !pattern.trim().is_empty())
            {
                let name = ctx.regexes.register(&field.name, pattern);
                attrs.push(format!("regex(path = *{name})"));
            }
        }

        if !field.array && matches!(base.kind, BaseKind::I64 | BaseKind::F64) {
            if validation.min.is_some() || validation.max.is_some() {
                attrs.push(range_rule(validation.min, validation.max, base.kind));
            }
        }
    }

    attrs
}

fn validator_parameter_type(rtype: &str, required: bool) -> String {
    if required {
        return rtype.to_string();
    }
    let inner = rtype
        .strip_prefix("Option<")
        .and_then(|value| value.strip_suffix('>'))
        .unwrap_or(rtype);
    format!("&{inner}")
}

fn alias_validation_rules(
    alias: &AliasModel,
    base: &BaseType,
    regexes: &mut RegexRegistry,
) -> Vec<AliasCheckCtx> {
    let Some(validation) = alias.validation.as_ref() else {
        return Vec::new();
    };
    let mut checks = Vec::new();

    if alias.array {
        if validation.min_items.is_some() || validation.max_items.is_some() {
            checks.push(AliasCheckCtx {
                expression: format!(
                    "validator::ValidateLength::validate_length(&value.0, {}, {}, None)",
                    option_u64(validation.min_items),
                    option_u64(validation.max_items)
                ),
                code: "length".into(),
            });
        }
    } else if base.kind == BaseKind::String {
        if validation.min_length.is_some() || validation.max_length.is_some() {
            checks.push(AliasCheckCtx {
                expression: format!(
                    "validator::ValidateLength::validate_length(&value.0, {}, {}, None)",
                    option_u64(validation.min_length),
                    option_u64(validation.max_length)
                ),
                code: "length".into(),
            });
        }
        if let Some(format) = validation.format.as_deref() {
            match format.to_ascii_lowercase().as_str() {
                "email" => checks.push(AliasCheckCtx {
                    expression: "validator::ValidateEmail::validate_email(&value.0)".into(),
                    code: "email".into(),
                }),
                "url" => checks.push(AliasCheckCtx {
                    expression: "validator::ValidateUrl::validate_url(&value.0)".into(),
                    code: "url".into(),
                }),
                _ => {}
            }
        }
        if let Some(pattern) = validation
            .pattern
            .as_deref()
            .filter(|pattern| !pattern.trim().is_empty())
        {
            let static_name = regexes.register(&alias.name, pattern);
            checks.push(AliasCheckCtx {
                expression: format!(
                    "validator::ValidateRegex::validate_regex(&value.0, &*{static_name})"
                ),
                code: "regex".into(),
            });
        }
    }

    if !alias.array && matches!(base.kind, BaseKind::I64 | BaseKind::F64) {
        if validation.min.is_some() || validation.max.is_some() {
            checks.push(AliasCheckCtx {
                expression: format!(
                    "validator::ValidateRange::validate_range(value.0, {}, {}, None, None)",
                    option_range(validation.min, base.kind),
                    option_range(validation.max, base.kind)
                ),
                code: "range".into(),
            });
        }
    }

    checks
}

fn length_rule(min: Option<u64>, max: Option<u64>) -> String {
    let mut parts = Vec::new();
    if let Some(min) = min {
        parts.push(format!("min = {min}"));
    }
    if let Some(max) = max {
        parts.push(format!("max = {max}"));
    }
    format!("length({})", parts.join(", "))
}

fn range_rule(min: Option<f64>, max: Option<f64>, kind: BaseKind) -> String {
    let mut parts = Vec::new();
    if let Some(min) = min {
        parts.push(format!("min = {}", number_literal(min, kind)));
    }
    if let Some(max) = max {
        parts.push(format!("max = {}", number_literal(max, kind)));
    }
    format!("range({})", parts.join(", "))
}

fn number_literal(value: f64, kind: BaseKind) -> String {
    if kind == BaseKind::I64 {
        format!("{}", value as i64)
    } else {
        format!("{value}")
    }
}

fn option_u64(value: Option<u64>) -> String {
    value
        .map(|value| format!("Some({value})"))
        .unwrap_or_else(|| "None".into())
}

fn option_range(value: Option<f64>, kind: BaseKind) -> String {
    value
        .map(|value| format!("Some({})", number_literal(value, kind)))
        .unwrap_or_else(|| "None".into())
}

fn validation_notes(validation: Option<&spec::FieldValidation>) -> Vec<String> {
    let Some(validation) = validation else {
        return Vec::new();
    };
    let mut notes = Vec::new();
    if let Some(value) = validation.min_length {
        notes.push(format!("`minLength`: {value}"));
    }
    if let Some(value) = validation.max_length {
        notes.push(format!("`maxLength`: {value}"));
    }
    if let Some(value) = &validation.pattern {
        notes.push(format!("`pattern`: `{value}`"));
    }
    if let Some(value) = &validation.format {
        notes.push(format!("`format`: `{value}`"));
    }
    if let Some(value) = validation.min {
        notes.push(format!("`min`: {value}"));
    }
    if let Some(value) = validation.max {
        notes.push(format!("`max`: {value}"));
    }
    if let Some(value) = validation.min_items {
        notes.push(format!("`minItems`: {value}"));
    }
    if let Some(value) = validation.max_items {
        notes.push(format!("`maxItems`: {value}"));
    }
    if let Some(value) = &validation.rule {
        notes.push(format!("`rule`: {value}"));
    }
    notes
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BaseKind {
    String,
    I64,
    F64,
    Bool,
    Json,
    Date,
    Time,
    DateTime,
    Uuid,
    Named,
}

#[derive(Debug, Clone)]
struct BaseType {
    kind: BaseKind,
    rust: String,
}

impl BaseType {
    fn new(kind: BaseKind, rust: impl Into<String>) -> Self {
        Self {
            kind,
            rust: rust.into(),
        }
    }

    fn uuid() -> Self {
        Self::new(BaseKind::Uuid, "uuid::Uuid")
    }

    fn date() -> Self {
        Self::new(BaseKind::Date, "chrono::NaiveDate")
    }

    fn time() -> Self {
        Self::new(BaseKind::Time, "chrono::NaiveTime")
    }

    fn datetime() -> Self {
        Self::new(BaseKind::DateTime, "chrono::DateTime<chrono::Utc>")
    }
}

fn base_type(name: &str, scope: Scope<'_>, resolver: &TypeResolver) -> BaseType {
    match naming::name_key(name).as_str() {
        "string" | "text" => BaseType::new(BaseKind::String, "String"),
        "integer" | "int" | "long" | "i64" => BaseType::new(BaseKind::I64, "i64"),
        "number" | "float" | "double" | "f64" => BaseType::new(BaseKind::F64, "f64"),
        "boolean" | "bool" => BaseType::new(BaseKind::Bool, "bool"),
        "json" | "any" | "value" => BaseType::new(BaseKind::Json, "serde_json::Value"),
        "datetime" | "date_time" | "timestamp" | "instant" => BaseType::datetime(),
        "date" | "local_date" | "localdate" | "naive_date" | "naivedate" => BaseType::date(),
        "time" | "local_time" | "localtime" | "naive_time" | "naivetime" => BaseType::time(),
        "uuid" | "guid" => BaseType::uuid(),
        _ => BaseType::new(BaseKind::Named, resolver.type_path(name, scope)),
    }
}

#[derive(Debug, Default)]
struct Dependencies {
    chrono: bool,
    uuid: bool,
}

impl Dependencies {
    fn note(&mut self, kind: BaseKind) {
        match kind {
            BaseKind::Date | BaseKind::Time | BaseKind::DateTime => self.chrono = true,
            BaseKind::Uuid => self.uuid = true,
            _ => {}
        }
    }
}

#[derive(Default)]
struct RegexRegistry {
    entries: Vec<RegexCtx>,
    used: HashSet<String>,
}

impl RegexRegistry {
    fn register(&mut self, hint: &str, pattern: &str) -> String {
        if let Some(existing) = self.entries.iter().find(|entry| entry.pattern == pattern) {
            return existing.name.clone();
        }
        let base = format!("{}_PATTERN", naming::shouty_snake_case(hint));
        let name = naming::unique_name(&base, &mut self.used);
        self.entries.push(RegexCtx {
            name: name.clone(),
            pattern: pattern.to_string(),
        });
        name
    }
}

struct ValidationCtx<'a> {
    regexes: &'a mut RegexRegistry,
    validators: &'a mut ValidatorRegistry,
}

#[derive(Default)]
struct ValidatorRegistry {
    entries: Vec<ValidatorFnCtx>,
    used: HashSet<String>,
}

impl ValidatorRegistry {
    fn register(
        &mut self,
        field_name: &str,
        parameter_type: String,
        optional: bool,
        array: bool,
        checks: Vec<AliasCheckCtx>,
    ) -> String {
        let mut base = naming::snake_case(field_name);
        if base.is_empty() {
            base = "field".into();
        }
        let name = naming::unique_name(&format!("validate_{base}"), &mut self.used);
        self.entries.push(ValidatorFnCtx {
            name: name.clone(),
            parameter_type,
            optional,
            array,
            checks,
        });
        name
    }
}

fn string_literal(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for character in value.chars() {
        match character {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            other => out.push(other),
        }
    }
    out.push('"');
    out
}

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

fn is_keyword(ident: &str) -> bool {
    RUST_KEYWORDS.contains(&ident)
}

fn is_special_keyword(ident: &str) -> bool {
    matches!(ident, "self" | "Self" | "super" | "crate")
}

/// `SendActivationEmail` -> `send_activation_email`, escaping keywords.
pub fn field_ident(name: &str) -> String {
    let mut ident = naming::snake_case(name);
    if ident.is_empty() {
        ident = "field".into();
    }
    if ident.starts_with(|character: char| character.is_ascii_digit()) {
        ident = format!("_{ident}");
    }
    if is_keyword(&ident) {
        if is_special_keyword(&ident) {
            ident.push('_');
        } else {
            ident = format!("r#{ident}");
        }
    }
    ident
}

/// `passkeyPolicy` -> `PasskeyPolicy`.
pub fn type_ident(name: &str) -> String {
    let mut ident = naming::pascal_case(name);
    if ident.is_empty() {
        ident = "Unnamed".into();
    }
    if ident.starts_with(|character: char| character.is_ascii_digit()) {
        ident = format!("T{ident}");
    }
    if is_special_keyword(&ident) {
        ident.push_str("Type");
    } else if is_keyword(&ident) {
        ident.push_str("Type");
    }
    ident
}

fn variant_ident(name: &str) -> String {
    type_ident(name)
}

fn module_names(name: &str) -> (String, String) {
    let mut base = naming::snake_case(name);
    if base.is_empty() {
        base = "domain".into();
    }
    if base.starts_with(|character: char| character.is_ascii_digit()) {
        base = format!("_{base}");
    }
    if is_special_keyword(&base) {
        base.push('_');
        return (base.clone(), base);
    }
    let ident = if is_keyword(&base) {
        format!("r#{base}")
    } else {
        base.clone()
    };
    (base, ident)
}

fn package_name(model: &Model, options: &GenerateOptions) -> String {
    let raw = options.crate_name.as_deref().unwrap_or(model.name.as_str());
    let mut name = naming::snake_case(raw);
    if name.is_empty() {
        name = "generated_spec".into();
    }
    if name.starts_with(|character: char| character.is_ascii_digit()) {
        name = format!("crate_{name}");
    }
    if is_keyword(&name) {
        name.push_str("_spec");
    }
    name
}

/// `identity:registerAccount` -> `identity:register_account`.
fn snake_action(value: &str) -> String {
    value
        .split(':')
        .map(|part| {
            if part == "*" {
                "*".to_string()
            } else {
                naming::snake_case(part)
            }
        })
        .collect::<Vec<_>>()
        .join(":")
}

fn doc_lines(description: Option<&str>) -> Vec<String> {
    description
        .map(|description| {
            description
                .lines()
                .map(|line| line.trim_end().to_string())
                .skip_while(|line| line.is_empty())
                .collect::<Vec<_>>()
        })
        .map(|mut lines| {
            while lines.last().is_some_and(|line| line.is_empty()) {
                lines.pop();
            }
            lines
        })
        .unwrap_or_default()
}
