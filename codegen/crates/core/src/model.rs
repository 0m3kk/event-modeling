//! Normalises a raw [`Specification`] into the model every generator consumes.
//!
//! The normaliser is deliberately forgiving: a card that was left half filled
//! (an empty field name, a duplicate method, a dangling type reference) yields
//! a warning instead of aborting the whole generation. Everything that *can* be
//! mapped is mapped; the warnings are printed by the CLI so the author can fix
//! the spec at the source.

use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};

use crate::error::CodegenError;
use crate::naming;
use crate::spec::{self, DataTypeDef, Field, FieldType, QueryItem, Specification};

/// A spec loaded from disk, plus the warnings produced while normalising it.
#[derive(Debug, Clone)]
pub struct LoadedSpec {
    pub model: Model,
}

impl LoadedSpec {
    pub fn warnings(&self) -> &[String] {
        &self.model.warnings
    }
}

/// The language-independent model passed to generators.
#[derive(Debug, Clone)]
pub struct Model {
    pub name: String,
    pub domains: Vec<DomainModel>,
    pub types: Vec<TypeModel>,
    pub events: Vec<EventModel>,
    pub commands: Vec<CommandModel>,
    pub queries: Vec<QueryModel>,
    pub states: Vec<StateModel>,
    pub services: Vec<ServiceModel>,
    pub actors: Vec<ActorModel>,
    pub constraints: Vec<ConstraintModel>,
    pub tags: Vec<TagModel>,
    pub slices: Vec<SliceModel>,
    pub warnings: Vec<String>,
}

impl Model {
    /// Finds a declared data type by its (case-insensitive) name.
    pub fn find_type(&self, name: &str) -> Option<&TypeModel> {
        let key = naming::name_key(name);
        self.types
            .iter()
            .find(|ty| naming::name_key(ty.name()) == key)
    }

    /// Every built-in scalar name understood by the generators.
    pub fn is_builtin_type(name: &str) -> bool {
        matches!(
            naming::name_key(name).as_str(),
            "string"
                | "text"
                | "integer"
                | "int"
                | "long"
                | "i64"
                | "number"
                | "float"
                | "double"
                | "f64"
                | "boolean"
                | "bool"
                | "json"
                | "any"
                | "value"
                | "datetime"
                | "date_time"
                | "timestamp"
                | "date"
                | "uuid"
        )
    }
}

#[derive(Debug, Clone)]
pub struct DomainModel {
    pub name: String,
    /// Snake-case module name, unique across the spec.
    pub module: String,
}

#[derive(Debug, Clone)]
pub enum TypeModel {
    Object(ObjectModel),
    Enum(EnumModel),
    Alias(AliasModel),
}

impl TypeModel {
    pub fn name(&self) -> &str {
        match self {
            TypeModel::Object(def) => &def.name,
            TypeModel::Enum(def) => &def.name,
            TypeModel::Alias(def) => &def.name,
        }
    }

    pub fn description(&self) -> Option<&str> {
        match self {
            TypeModel::Object(def) => def.description.as_deref(),
            TypeModel::Enum(def) => def.description.as_deref(),
            TypeModel::Alias(def) => def.description.as_deref(),
        }
    }

    pub fn domain(&self) -> Option<&str> {
        match self {
            TypeModel::Object(def) => def.domain.as_deref(),
            TypeModel::Enum(def) => def.domain.as_deref(),
            TypeModel::Alias(def) => def.domain.as_deref(),
        }
    }

    pub fn set_domain(&mut self, domain: Option<String>) {
        match self {
            TypeModel::Object(def) => def.domain = domain,
            TypeModel::Enum(def) => def.domain = domain,
            TypeModel::Alias(def) => def.domain = domain,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ObjectModel {
    pub name: String,
    pub description: Option<String>,
    pub fields: Vec<FieldModel>,
    pub domain: Option<String>,
}

#[derive(Debug, Clone)]
pub struct EnumModel {
    pub name: String,
    pub description: Option<String>,
    pub values: Vec<EnumValueModel>,
    pub domain: Option<String>,
}

#[derive(Debug, Clone)]
pub struct EnumValueModel {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AliasModel {
    pub name: String,
    pub description: Option<String>,
    pub of: String,
    pub array: bool,
    pub validation: Option<spec::FieldValidation>,
    pub domain: Option<String>,
}

#[derive(Debug, Clone)]
pub struct FieldModel {
    pub name: String,
    pub ty: String,
    pub array: bool,
    pub required: bool,
    pub tag: Option<String>,
    pub description: Option<String>,
    pub validation: Option<spec::FieldValidation>,
}

#[derive(Debug, Clone)]
pub struct EventModel {
    pub name: String,
    pub description: Option<String>,
    pub fields: Vec<FieldModel>,
    pub domain: Option<String>,
    pub used_in_slices: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct CommandModel {
    pub name: String,
    pub action: Option<String>,
    pub description: Option<String>,
    pub inputs: Vec<FieldModel>,
    pub responses: Vec<FieldModel>,
    pub domain: Option<String>,
    pub used_in_slices: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct QueryModel {
    pub name: String,
    pub action: Option<String>,
    pub description: Option<String>,
    pub params: Vec<FieldModel>,
    pub responses: Vec<FieldModel>,
    pub domain: Option<String>,
    pub used_in_slices: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct StateModel {
    pub name: String,
    pub description: Option<String>,
    pub params: Vec<FieldModel>,
    pub query: Vec<QuerySourceModel>,
    pub states: Vec<FieldModel>,
    pub domain: Option<String>,
    pub used_in_slices: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct QuerySourceModel {
    pub types: Vec<String>,
    pub tags: Vec<QueryTagModel>,
    pub description: Option<String>,
}

#[derive(Debug, Clone)]
pub struct QueryTagModel {
    pub tag: String,
    pub field: String,
}

#[derive(Debug, Clone)]
pub struct ServiceModel {
    pub name: String,
    pub service_name: Option<String>,
    pub description: Option<String>,
    pub params: Vec<FieldModel>,
    pub returns: Vec<FieldModel>,
    /// Domain whose slice first calls this method, if any.
    pub domain: Option<String>,
    pub used_in_slices: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ActorModel {
    pub name: String,
    pub description: Option<String>,
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ConstraintModel {
    pub name: String,
    pub description: Option<String>,
    pub states: Vec<String>,
    pub rules: Vec<String>,
    pub used_in_slices: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct TagModel {
    pub tag: String,
    pub types: Vec<String>,
    pub from_events: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct SliceModel {
    pub name: String,
    pub domain: Option<String>,
    pub description: Option<String>,
    pub lanes: Vec<LaneModel>,
}

#[derive(Debug, Clone)]
pub struct LaneModel {
    pub kind: String,
    pub cards: Vec<String>,
}

/// Reads and normalises a spec from `path`.
pub fn load_spec(path: impl AsRef<Path>) -> Result<LoadedSpec, CodegenError> {
    let path = path.as_ref();
    let source = std::fs::read_to_string(path).map_err(|source| CodegenError::ReadSpec {
        path: path.to_path_buf(),
        source,
    })?;
    parse_spec(&source, path)
}

/// Parses and normalises a spec from a string. `path` is only used in errors.
pub fn parse_spec(source: &str, path: impl Into<PathBuf>) -> Result<LoadedSpec, CodegenError> {
    let path = path.into();
    let spec: Specification =
        serde_yaml::from_str(source).map_err(|error| CodegenError::ParseSpec {
            path,
            message: error.to_string(),
        })?;
    Ok(LoadedSpec {
        model: build_model(spec),
    })
}

/// Normalises an already-parsed spec.
pub fn build_model(mut spec: Specification) -> Model {
    let mut warnings = Vec::new();
    hoist_inline_types(&mut spec, &mut warnings);

    let types = normalise_types(&spec.types, &mut warnings);

    let mut events = Vec::new();
    let mut event_keys = HashSet::new();
    for event in &spec.events {
        let name = clean_name(&event.name);
        if name.is_empty() {
            warnings.push("skipping an event without a name".into());
            continue;
        }
        if !event_keys.insert(naming::name_key(&name)) {
            warnings.push(format!("duplicate event `{name}` ignored"));
            continue;
        }
        events.push(EventModel {
            description: clean_description(event.description.clone()),
            fields: normalise_fields(&event.fields, &format!("event `{name}`"), &mut warnings),
            name,
            domain: None,
            used_in_slices: Vec::new(),
        });
    }

    let mut commands = Vec::new();
    let mut command_keys = HashSet::new();
    for command in &spec.commands {
        let name = clean_name(&command.name);
        if name.is_empty() {
            warnings.push("skipping a command without a name".into());
            continue;
        }
        if !command_keys.insert(naming::name_key(&name)) {
            warnings.push(format!("duplicate command `{name}` ignored"));
            continue;
        }
        commands.push(CommandModel {
            action: clean_description(command.action.clone()),
            description: clean_description(command.description.clone()),
            inputs: normalise_fields(
                &command.inputs,
                &format!("command `{name}` inputs"),
                &mut warnings,
            ),
            responses: normalise_fields(
                &command.responses,
                &format!("command `{name}` responses"),
                &mut warnings,
            ),
            name,
            domain: None,
            used_in_slices: Vec::new(),
        });
    }

    let mut queries = Vec::new();
    let mut query_keys = HashSet::new();
    for query in &spec.queries {
        let name = clean_name(&query.name);
        if name.is_empty() {
            warnings.push("skipping a query without a name".into());
            continue;
        }
        if !query_keys.insert(naming::name_key(&name)) {
            warnings.push(format!("duplicate query `{name}` ignored"));
            continue;
        }
        queries.push(QueryModel {
            action: clean_description(query.action.clone()),
            description: clean_description(query.description.clone()),
            params: normalise_fields(
                &query.params,
                &format!("query `{name}` params"),
                &mut warnings,
            ),
            responses: normalise_fields(
                &query.responses,
                &format!("query `{name}` responses"),
                &mut warnings,
            ),
            name,
            domain: None,
            used_in_slices: Vec::new(),
        });
    }

    let mut states = Vec::new();
    let mut state_keys = HashSet::new();
    for state in spec.states.iter().chain(spec.views.iter()) {
        let name = clean_name(&state.name);
        if name.is_empty() {
            warnings.push("skipping a state without a name".into());
            continue;
        }
        if !state_keys.insert(naming::name_key(&name)) {
            warnings.push(format!("duplicate state `{name}` ignored"));
            continue;
        }
        states.push(StateModel {
            description: clean_description(state.description.clone()),
            params: normalise_fields(
                &state.params,
                &format!("state `{name}` params"),
                &mut warnings,
            ),
            query: state.query.iter().map(normalise_query_item).collect(),
            states: normalise_fields(
                &state.states,
                &format!("state `{name}` states"),
                &mut warnings,
            ),
            name,
            domain: None,
            used_in_slices: Vec::new(),
        });
    }

    let services = normalise_services(&spec.services, &mut warnings);
    let actors = normalise_actors(&spec.actors);
    let constraints = normalise_constraints(&spec.constraints, &mut warnings);
    let tags = normalise_tags(&spec.tags, &mut warnings);
    let slices = normalise_slices(&spec.slices, &mut warnings);

    let mut model = Model {
        name: clean_name(&spec.name),
        domains: Vec::new(),
        types,
        events,
        commands,
        queries,
        states,
        services,
        actors,
        constraints,
        tags,
        slices,
        warnings,
    };
    if model.name.is_empty() {
        model.name = "Specification".into();
        model
            .warnings
            .push("the specification has no name; using `Specification`".into());
    }

    assign_domains(&mut model, &spec);
    model
}

// ---------------------------------------------------------------------------
// Inline type hoisting
// ---------------------------------------------------------------------------

fn hoist_inline_types(spec: &mut Specification, warnings: &mut Vec<String>) {
    let mut registry = Vec::new();
    let mut seen = BTreeMap::new();

    for def in std::mem::take(&mut spec.types) {
        register_type(def, &mut registry, &mut seen, warnings);
    }

    for event in &mut spec.events {
        hoist_fields(&mut event.fields, &mut registry, &mut seen, warnings);
    }
    for command in &mut spec.commands {
        hoist_fields(&mut command.inputs, &mut registry, &mut seen, warnings);
        hoist_fields(&mut command.responses, &mut registry, &mut seen, warnings);
    }
    for query in &mut spec.queries {
        hoist_fields(&mut query.params, &mut registry, &mut seen, warnings);
        hoist_fields(&mut query.responses, &mut registry, &mut seen, warnings);
    }
    for state in spec.states.iter_mut().chain(spec.views.iter_mut()) {
        hoist_fields(&mut state.params, &mut registry, &mut seen, warnings);
        hoist_fields(&mut state.states, &mut registry, &mut seen, warnings);
    }
    for service in &mut spec.services {
        hoist_fields(&mut service.params, &mut registry, &mut seen, warnings);
        hoist_fields(&mut service.returns, &mut registry, &mut seen, warnings);
        for method in &mut service.methods {
            hoist_fields(&mut method.params, &mut registry, &mut seen, warnings);
            hoist_fields(&mut method.returns, &mut registry, &mut seen, warnings);
        }
    }

    spec.types = registry;
}

fn register_type(
    def: DataTypeDef,
    registry: &mut Vec<DataTypeDef>,
    seen: &mut BTreeMap<String, usize>,
    warnings: &mut Vec<String>,
) {
    let name = clean_name(def.name());
    if name.is_empty() {
        warnings.push("skipping a data type without a name".into());
        return;
    }
    let key = naming::name_key(&name);
    if seen.contains_key(&key) {
        warnings.push(format!("duplicate data type `{name}` ignored"));
        return;
    }

    let index = registry.len();
    seen.insert(key, index);
    // Insert a placeholder before descending so a self-referential inline type
    // terminates instead of recursing forever.
    registry.push(def.clone());
    let hoisted = match def {
        DataTypeDef::Object(mut object) => {
            hoist_fields(&mut object.fields, registry, seen, warnings);
            DataTypeDef::Object(object)
        }
        other => other,
    };
    registry[index] = hoisted;
}

fn hoist_fields(
    fields: &mut [Field],
    registry: &mut Vec<DataTypeDef>,
    seen: &mut BTreeMap<String, usize>,
    warnings: &mut Vec<String>,
) {
    for field in fields {
        let Some(FieldType::Inline(def)) = field.ty.clone() else {
            continue;
        };
        let name = clean_name(def.name());
        if !name.is_empty() && !seen.contains_key(&naming::name_key(&name)) {
            register_type(def, registry, seen, warnings);
        }
        field.ty = Some(FieldType::Name(name));
    }
}

// ---------------------------------------------------------------------------
// Per-category normalisation
// ---------------------------------------------------------------------------

fn normalise_types(defs: &[DataTypeDef], warnings: &mut Vec<String>) -> Vec<TypeModel> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    for def in defs {
        let name = clean_name(def.name());
        if name.is_empty() {
            continue;
        }
        let key = naming::name_key(&name);
        if !seen.insert(key) {
            continue;
        }

        let model = match def {
            DataTypeDef::Object(object) => TypeModel::Object(ObjectModel {
                name,
                description: clean_description(object.description.clone()),
                fields: normalise_fields(
                    &object.fields,
                    &format!("object `{}`", def.name()),
                    warnings,
                ),
                domain: None,
            }),
            DataTypeDef::Enum(enumeration) => {
                let mut values = Vec::new();
                let mut value_keys = HashSet::new();
                for value in &enumeration.values {
                    let value_name = clean_name(value.name());
                    if value_name.is_empty() {
                        warnings.push(format!(
                            "enum `{}`: skipping a value without a name",
                            def.name()
                        ));
                        continue;
                    }
                    if !value_keys.insert(naming::name_key(&value_name)) {
                        warnings.push(format!(
                            "enum `{}`: duplicate value `{value_name}` ignored",
                            def.name()
                        ));
                        continue;
                    }
                    values.push(EnumValueModel {
                        description: clean_description(value.description().map(str::to_string)),
                        name: value_name,
                    });
                }
                TypeModel::Enum(EnumModel {
                    name,
                    description: clean_description(enumeration.description.clone()),
                    values,
                    domain: None,
                })
            }
            DataTypeDef::Alias(alias) => {
                let of = clean_name(&alias.of);
                if of.is_empty() {
                    warnings.push(format!("alias `{name}` has no `of` type; ignored"));
                    continue;
                }
                TypeModel::Alias(AliasModel {
                    name,
                    description: clean_description(alias.description.clone()),
                    of,
                    array: alias.array,
                    validation: alias.validation.clone(),
                    domain: None,
                })
            }
        };
        out.push(model);
    }
    out
}

fn normalise_fields(fields: &[Field], owner: &str, warnings: &mut Vec<String>) -> Vec<FieldModel> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    for field in fields {
        let name = clean_name(field.name.as_deref().unwrap_or_default());
        if name.is_empty() {
            warnings.push(format!("{owner}: skipping a field without a name"));
            continue;
        }
        let Some(ty) = field.ty.as_ref().and_then(FieldType::name) else {
            warnings.push(format!("{owner}: skipping `{name}`, it has no type"));
            continue;
        };
        let ty = clean_name(ty);
        if ty.is_empty() {
            warnings.push(format!("{owner}: skipping `{name}`, it has no type"));
            continue;
        }
        if !seen.insert(naming::name_key(&name)) {
            warnings.push(format!("{owner}: duplicate field `{name}` ignored"));
            continue;
        }
        out.push(FieldModel {
            name,
            ty,
            array: field.array,
            required: field.required,
            tag: clean_description(field.tag.clone()),
            description: clean_description(field.description.clone()),
            validation: field.validation.clone(),
        });
    }
    out
}

fn normalise_query_item(item: &QueryItem) -> QuerySourceModel {
    QuerySourceModel {
        types: item
            .types
            .iter()
            .map(|ty| clean_name(ty))
            .filter(|ty| !ty.is_empty())
            .collect(),
        tags: item
            .tags
            .iter()
            .filter(|tag| !clean_name(&tag.tag).is_empty() && !clean_name(&tag.field).is_empty())
            .map(|tag| QueryTagModel {
                tag: clean_name(&tag.tag),
                field: clean_name(&tag.field),
            })
            .collect(),
        description: clean_description(item.description.clone()),
    }
}

fn normalise_services(
    services: &[spec::ServiceDef],
    warnings: &mut Vec<String>,
) -> Vec<ServiceModel> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    let mut push = |name: String,
                    service_name: Option<String>,
                    description: Option<String>,
                    params: &[Field],
                    returns: &[Field],
                    out: &mut Vec<ServiceModel>,
                    warnings: &mut Vec<String>| {
        let name = clean_name(&name);
        if name.is_empty() {
            warnings.push("skipping a service method without a name".into());
            return;
        }
        if !seen.insert(naming::name_key(&name)) {
            warnings.push(format!("duplicate service method `{name}` ignored"));
            return;
        }
        out.push(ServiceModel {
            params: normalise_fields(params, &format!("service `{name}` params"), warnings),
            returns: normalise_fields(returns, &format!("service `{name}` returns"), warnings),
            name,
            service_name: clean_description(service_name),
            description: clean_description(description),
            domain: None,
            used_in_slices: Vec::new(),
        });
    };

    for service in services {
        if !service.methods.is_empty() {
            for method in &service.methods {
                push(
                    method.name.clone(),
                    service.service_name.clone(),
                    method.description.clone(),
                    &method.params,
                    &method.returns,
                    &mut out,
                    warnings,
                );
            }
        } else {
            push(
                service.name.clone(),
                service.service_name.clone(),
                service.description.clone(),
                &service.params,
                &service.returns,
                &mut out,
                warnings,
            );
        }
    }
    out
}

fn normalise_actors(actors: &[spec::ActorDef]) -> Vec<ActorModel> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for actor in actors {
        let name = clean_name(&actor.name);
        if name.is_empty() || !seen.insert(naming::name_key(&name)) {
            continue;
        }
        out.push(ActorModel {
            name,
            description: clean_description(actor.description.clone()),
            permissions: actor
                .permissions
                .iter()
                .map(|permission| clean_name(permission))
                .filter(|permission| !permission.is_empty())
                .collect(),
        });
    }
    out
}

fn normalise_constraints(
    constraints: &[spec::ConstraintDef],
    warnings: &mut Vec<String>,
) -> Vec<ConstraintModel> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for constraint in constraints {
        let name = clean_name(&constraint.name);
        if name.is_empty() {
            warnings.push("skipping a constraint without a name".into());
            continue;
        }
        if !seen.insert(naming::name_key(&name)) {
            warnings.push(format!("duplicate constraint `{name}` ignored"));
            continue;
        }
        out.push(ConstraintModel {
            name,
            description: clean_description(constraint.description.clone()),
            states: constraint
                .states
                .iter()
                .map(|state| clean_name(state.name()))
                .filter(|state| !state.is_empty())
                .collect(),
            rules: constraint
                .rules
                .iter()
                .map(|rule| rule.trim().to_string())
                .filter(|rule| !rule.is_empty())
                .collect(),
            used_in_slices: Vec::new(),
        });
    }
    out
}

fn normalise_tags(tags: &[spec::TagDef], warnings: &mut Vec<String>) -> Vec<TagModel> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for tag in tags {
        let name = clean_name(&tag.tag);
        if name.is_empty() {
            warnings.push("skipping a tag without a name".into());
            continue;
        }
        if !seen.insert(naming::name_key(&name)) {
            warnings.push(format!("duplicate tag `{name}` ignored"));
            continue;
        }
        out.push(TagModel {
            tag: name,
            types: tag
                .types
                .iter()
                .map(|ty| clean_name(ty))
                .filter(|ty| !ty.is_empty())
                .collect(),
            from_events: tag
                .from_events
                .iter()
                .map(|event| clean_name(event))
                .filter(|event| !event.is_empty())
                .collect(),
        });
    }
    out
}

fn normalise_slices(slices: &[spec::Slice], warnings: &mut Vec<String>) -> Vec<SliceModel> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for slice in slices {
        let name = clean_name(&slice.name);
        if name.is_empty() {
            warnings.push("skipping a slice without a name".into());
            continue;
        }
        if !seen.insert(naming::name_key(&name)) {
            warnings.push(format!("duplicate slice `{name}` ignored"));
            continue;
        }
        out.push(SliceModel {
            name,
            domain: clean_description(slice.domain.clone()),
            description: clean_description(slice.description.clone()),
            lanes: slice
                .lanes
                .iter()
                .filter_map(|lane| {
                    let cards: Vec<String> = lane
                        .cards
                        .iter()
                        .map(|card| clean_name(card))
                        .filter(|card| !card.is_empty())
                        .collect();
                    if cards.is_empty() {
                        None
                    } else {
                        Some(LaneModel {
                            kind: clean_name(&lane.kind),
                            cards,
                        })
                    }
                })
                .collect(),
        });
    }
    out
}

// ---------------------------------------------------------------------------
// Domain assignment
// ---------------------------------------------------------------------------

struct Registries {
    types: BTreeMap<String, usize>,
    events: BTreeMap<String, usize>,
    commands: BTreeMap<String, usize>,
    queries: BTreeMap<String, usize>,
    states: BTreeMap<String, usize>,
    services: BTreeMap<String, usize>,
    constraints: BTreeMap<String, usize>,
}

impl Registries {
    fn build(model: &Model) -> Self {
        fn index<T>(items: &[T], name: impl Fn(&T) -> &str) -> BTreeMap<String, usize> {
            items
                .iter()
                .enumerate()
                .map(|(i, item)| (naming::name_key(name(item)), i))
                .collect()
        }
        Self {
            types: index(&model.types, TypeModel::name),
            events: index(&model.events, |event| &event.name),
            commands: index(&model.commands, |command| &command.name),
            queries: index(&model.queries, |query| &query.name),
            states: index(&model.states, |state| &state.name),
            services: index(&model.services, |service| &service.name),
            constraints: index(&model.constraints, |constraint| &constraint.name),
        }
    }
}

fn assign_domains(model: &mut Model, spec: &Specification) {
    let registries = Registries::build(model);

    let mut type_domains = vec![None; model.types.len()];
    let mut event_domains = vec![None; model.events.len()];
    let mut command_domains = vec![None; model.commands.len()];
    let mut query_domains = vec![None; model.queries.len()];
    let mut state_domains = vec![None; model.states.len()];

    let mut event_slices = vec![Vec::new(); model.events.len()];
    let mut command_slices = vec![Vec::new(); model.commands.len()];
    let mut query_slices = vec![Vec::new(); model.queries.len()];
    let mut state_slices = vec![Vec::new(); model.states.len()];
    let mut service_slices = vec![Vec::new(); model.services.len()];
    let mut constraint_slices = vec![Vec::new(); model.constraints.len()];

    let mut canonical = BTreeMap::new();
    for domain in &spec.domains {
        let name = clean_name(&domain.name);
        if !name.is_empty() {
            canonical
                .entry(naming::name_key(&name))
                .or_insert(name.clone());
        }
    }

    let canonicalise = |value: &str| -> String {
        let value = clean_name(value);
        canonical
            .get(&naming::name_key(&value))
            .cloned()
            .unwrap_or(value)
    };

    // Slice -> domain, used to place service methods in a domain.
    let mut slice_domains = BTreeMap::new();
    for slice in &spec.slices {
        let name = clean_name(&slice.name);
        if name.is_empty() {
            continue;
        }
        if let Some(domain) = slice
            .domain
            .as_deref()
            .map(clean_name)
            .filter(|domain| !domain.is_empty())
        {
            slice_domains.insert(naming::name_key(&name), canonicalise(&domain));
        }
    }

    let mut group_domain = BTreeMap::new();
    for group in &spec.groups {
        if let Some(domain) = group
            .domain
            .as_deref()
            .map(clean_name)
            .filter(|domain| !domain.is_empty())
        {
            group_domain.insert(naming::name_key(&group.name), canonicalise(&domain));
        }
    }
    for domain in &spec.domains {
        for group in &domain.groups {
            group_domain
                .entry(naming::name_key(group))
                .or_insert_with(|| canonicalise(&domain.name));
        }
    }

    // 1. Explicit domain membership.
    for domain in &spec.domains {
        let name = canonicalise(&domain.name);
        for card in &domain.cards {
            assign_all(
                &registries,
                card,
                &name,
                &mut type_domains,
                &mut event_domains,
                &mut command_domains,
                &mut query_domains,
                &mut state_domains,
            );
        }
    }

    // 2. Group membership (types, states, and any other card a group lists).
    for group in &spec.groups {
        let Some(domain) = group_domain.get(&naming::name_key(&group.name)) else {
            continue;
        };
        for card in &group.cards {
            assign_all(
                &registries,
                card,
                domain,
                &mut type_domains,
                &mut event_domains,
                &mut command_domains,
                &mut query_domains,
                &mut state_domains,
            );
        }
    }

    // 3. Slice lanes are the remaining source of domain membership.
    for slice in &spec.slices {
        let Some(domain) = slice
            .domain
            .as_deref()
            .map(clean_name)
            .filter(|domain| !domain.is_empty())
        else {
            continue;
        };
        let domain = canonicalise(&domain);
        let slice_name = clean_name(&slice.name);

        for lane in &slice.lanes {
            let kind = lane.kind.to_ascii_lowercase();
            for card in &lane.cards {
                let key = naming::name_key(card);
                match kind.as_str() {
                    "event" => {
                        assign(&registries.events, &mut event_domains, &key, &domain);
                        record(&registries.events, &mut event_slices, &key, &slice_name);
                    }
                    "command" => {
                        assign(&registries.commands, &mut command_domains, &key, &domain);
                        record(&registries.commands, &mut command_slices, &key, &slice_name);
                    }
                    "query" => {
                        assign(&registries.queries, &mut query_domains, &key, &domain);
                        record(&registries.queries, &mut query_slices, &key, &slice_name);
                    }
                    "state" | "view" => {
                        assign(&registries.states, &mut state_domains, &key, &domain);
                        record(&registries.states, &mut state_slices, &key, &slice_name);
                    }
                    "service" => {
                        record(&registries.services, &mut service_slices, &key, &slice_name);
                    }
                    "constraint" => {
                        record(
                            &registries.constraints,
                            &mut constraint_slices,
                            &key,
                            &slice_name,
                        );
                    }
                    _ => {
                        assign_all(
                            &registries,
                            card,
                            &domain,
                            &mut type_domains,
                            &mut event_domains,
                            &mut command_domains,
                            &mut query_domains,
                            &mut state_domains,
                        );
                        record(&registries.events, &mut event_slices, &key, &slice_name);
                        record(&registries.commands, &mut command_slices, &key, &slice_name);
                        record(&registries.queries, &mut query_slices, &key, &slice_name);
                        record(&registries.states, &mut state_slices, &key, &slice_name);
                        record(&registries.services, &mut service_slices, &key, &slice_name);
                        record(
                            &registries.constraints,
                            &mut constraint_slices,
                            &key,
                            &slice_name,
                        );
                    }
                }
            }
        }
    }

    for (i, item) in model.types.iter_mut().enumerate() {
        item.set_domain(type_domains[i].clone());
    }
    for (i, item) in model.events.iter_mut().enumerate() {
        item.domain = event_domains[i].clone();
        item.used_in_slices = std::mem::take(&mut event_slices[i]);
    }
    for (i, item) in model.commands.iter_mut().enumerate() {
        item.domain = command_domains[i].clone();
        item.used_in_slices = std::mem::take(&mut command_slices[i]);
    }
    for (i, item) in model.queries.iter_mut().enumerate() {
        item.domain = query_domains[i].clone();
        item.used_in_slices = std::mem::take(&mut query_slices[i]);
    }
    for (i, item) in model.states.iter_mut().enumerate() {
        item.domain = state_domains[i].clone();
        item.used_in_slices = std::mem::take(&mut state_slices[i]);
    }
    for (i, item) in model.services.iter_mut().enumerate() {
        item.used_in_slices = std::mem::take(&mut service_slices[i]);
        item.domain = item
            .used_in_slices
            .first()
            .and_then(|slice| slice_domains.get(&naming::name_key(slice)).cloned());
    }
    for (i, item) in model.constraints.iter_mut().enumerate() {
        item.used_in_slices = std::mem::take(&mut constraint_slices[i]);
    }

    for slice in &mut model.slices {
        slice.domain = slice
            .domain
            .as_deref()
            .map(clean_name)
            .filter(|domain| !domain.is_empty())
            .map(|domain| canonicalise(&domain));
    }

    // Declared domains first, then any domain an item or slice referenced but
    // the document never declared.
    let mut declared = Vec::new();
    for domain in &spec.domains {
        let name = clean_name(&domain.name);
        if !name.is_empty() && !declared.iter().any(|d: &String| d == &name) {
            declared.push(name);
        }
    }

    let mut implicit = Vec::new();
    let mut seen = HashSet::new();
    let referenced = model
        .types
        .iter()
        .filter_map(TypeModel::domain)
        .chain(model.events.iter().filter_map(|e| e.domain.as_deref()))
        .chain(model.commands.iter().filter_map(|c| c.domain.as_deref()))
        .chain(model.queries.iter().filter_map(|q| q.domain.as_deref()))
        .chain(model.states.iter().filter_map(|s| s.domain.as_deref()))
        .chain(model.slices.iter().filter_map(|s| s.domain.as_deref()));
    for domain in referenced {
        if !declared.iter().any(|d| d == domain) && seen.insert(domain.to_string()) {
            implicit.push(domain.to_string());
        }
    }
    for domain in &implicit {
        model.warnings.push(format!(
            "domain `{domain}` is referenced but not declared; generating it anyway"
        ));
    }

    let mut module_names = HashSet::new();
    for name in declared.into_iter().chain(implicit) {
        let module = naming::unique_name(&naming::snake_case(&name), &mut module_names);
        model.domains.push(DomainModel { name, module });
    }
}

fn assign(
    index: &BTreeMap<String, usize>,
    domains: &mut [Option<String>],
    key: &str,
    domain: &str,
) {
    if let Some(&i) = index.get(key) {
        if domains[i].is_none() {
            domains[i] = Some(domain.to_string());
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn assign_all(
    registries: &Registries,
    card: &str,
    domain: &str,
    type_domains: &mut [Option<String>],
    event_domains: &mut [Option<String>],
    command_domains: &mut [Option<String>],
    query_domains: &mut [Option<String>],
    state_domains: &mut [Option<String>],
) {
    let key = naming::name_key(card);
    assign(&registries.types, type_domains, &key, domain);
    assign(&registries.events, event_domains, &key, domain);
    assign(&registries.commands, command_domains, &key, domain);
    assign(&registries.queries, query_domains, &key, domain);
    assign(&registries.states, state_domains, &key, domain);
}

fn record(index: &BTreeMap<String, usize>, slices: &mut [Vec<String>], key: &str, slice: &str) {
    if let Some(&i) = index.get(key) {
        if !slice.is_empty() && !slices[i].iter().any(|name| name == slice) {
            slices[i].push(slice.to_string());
        }
    }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

fn clean_name(value: &str) -> String {
    value.trim().to_string()
}

fn clean_description(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let value = value.trim().to_string();
        if value.is_empty() { None } else { Some(value) }
    })
}
