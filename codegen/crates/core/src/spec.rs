//! Serde mirror of the specification document contract.
//!
//! The shape intentionally matches `packages/spec/src/types.ts`: a spec is
//! meaning-only (domains, slices, events, commands, types...) and never carries
//! geometry or board ids. Unknown keys are ignored so the generator keeps
//! working when the board grows new card-level metadata.

use serde::{Deserialize, Serialize};

/// The root specification document.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct Specification {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub domains: Vec<Domain>,
    #[serde(default)]
    pub groups: Vec<Group>,
    #[serde(default)]
    pub slices: Vec<Slice>,
    #[serde(default)]
    pub types: Vec<DataTypeDef>,
    #[serde(default)]
    pub events: Vec<EventDef>,
    #[serde(default)]
    pub commands: Vec<CommandDef>,
    #[serde(default)]
    pub queries: Vec<QueryDef>,
    /// Deprecated read models; merged into [`Specification::states`].
    #[serde(default)]
    pub views: Vec<StateLikeDef>,
    #[serde(default)]
    pub states: Vec<StateLikeDef>,
    #[serde(default)]
    pub constraints: Vec<ConstraintDef>,
    #[serde(default)]
    pub services: Vec<ServiceDef>,
    #[serde(default)]
    pub actors: Vec<ActorDef>,
    #[serde(default)]
    pub tags: Vec<TagDef>,
    #[serde(default)]
    pub notes: Vec<NoteDef>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct Domain {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub groups: Vec<String>,
    #[serde(default)]
    pub slices: Vec<String>,
    #[serde(default)]
    pub cards: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct Group {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub domain: Option<String>,
    #[serde(default)]
    pub cards: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct Slice {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub domain: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub lanes: Vec<SliceLane>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct SliceLane {
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default)]
    pub cards: Vec<String>,
}

/// A data container (object / enum / alias), defined once and referenced by name.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(untagged)]
pub enum DataTypeDef {
    Object(ObjectTypeDef),
    Enum(EnumTypeDef),
    Alias(AliasTypeDef),
}

impl DataTypeDef {
    pub fn name(&self) -> &str {
        match self {
            DataTypeDef::Object(def) => &def.object,
            DataTypeDef::Enum(def) => &def.enum_,
            DataTypeDef::Alias(def) => &def.alias,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ObjectTypeDef {
    pub object: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub fields: Vec<Field>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EnumTypeDef {
    #[serde(rename = "enum")]
    pub enum_: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub values: Vec<NamedRef>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AliasTypeDef {
    pub alias: String,
    #[serde(default)]
    pub of: String,
    #[serde(default)]
    pub array: bool,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub validation: Option<FieldValidation>,
}

/// The declared type of a field: a plain name or (legacy) an inline definition.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(untagged)]
pub enum FieldType {
    Name(String),
    Inline(DataTypeDef),
}

impl FieldType {
    pub fn name(&self) -> Option<&str> {
        match self {
            FieldType::Name(name) => Some(name.as_str()),
            FieldType::Inline(def) => Some(def.name()),
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct Field {
    /// A null name is accepted so a partially filled card does not abort the
    /// whole generation; the normaliser drops such fields with a warning.
    #[serde(default)]
    pub name: Option<String>,
    #[serde(rename = "type", default)]
    pub ty: Option<FieldType>,
    #[serde(default)]
    pub array: bool,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub tag: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub validation: Option<FieldValidation>,
}

/// JSON-Schema-like constraints a field or alias can declare.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldValidation {
    #[serde(default)]
    pub min_length: Option<u64>,
    #[serde(default)]
    pub max_length: Option<u64>,
    #[serde(default)]
    pub pattern: Option<String>,
    #[serde(default)]
    pub format: Option<String>,
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub min_items: Option<u64>,
    #[serde(default)]
    pub max_items: Option<u64>,
    #[serde(default)]
    pub rule: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(untagged)]
pub enum NamedRef {
    Name(String),
    Detailed {
        name: String,
        #[serde(default)]
        description: Option<String>,
    },
}

impl NamedRef {
    pub fn name(&self) -> &str {
        match self {
            NamedRef::Name(name) => name,
            NamedRef::Detailed { name, .. } => name,
        }
    }

    pub fn description(&self) -> Option<&str> {
        match self {
            NamedRef::Name(_) => None,
            NamedRef::Detailed { description, .. } => description.as_deref(),
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct EventDef {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub fields: Vec<Field>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct CommandDef {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub action: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub inputs: Vec<Field>,
    #[serde(default)]
    pub responses: Vec<Field>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct QueryDef {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub action: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub params: Vec<Field>,
    #[serde(default)]
    pub responses: Vec<Field>,
}

/// Shared shape for State (and the deprecated View) cards.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct StateLikeDef {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub params: Vec<Field>,
    #[serde(default)]
    pub query: Vec<QueryItem>,
    #[serde(default)]
    pub states: Vec<Field>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct QueryItem {
    #[serde(default)]
    pub types: Vec<String>,
    #[serde(default)]
    pub tags: Vec<QueryTag>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct QueryTag {
    #[serde(default)]
    pub tag: String,
    #[serde(default)]
    pub field: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct ConstraintDef {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub states: Vec<NamedRef>,
    #[serde(default)]
    pub rules: Vec<String>,
}

/// One service method execution. Methods sharing `serviceName` form one trait.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct ServiceDef {
    #[serde(default)]
    pub name: String,
    #[serde(rename = "serviceName", default)]
    pub service_name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub params: Vec<Field>,
    #[serde(default)]
    pub returns: Vec<Field>,
    /// Legacy multi-method shape, still parsed when present.
    #[serde(default)]
    pub methods: Vec<ServiceMethod>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct ServiceMethod {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub params: Vec<Field>,
    #[serde(default)]
    pub returns: Vec<Field>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct ActorDef {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct TagDef {
    #[serde(default)]
    pub tag: String,
    #[serde(default)]
    pub types: Vec<String>,
    #[serde(rename = "fromEvents", default)]
    pub from_events: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct NoteDef {
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub description: Option<String>,
}
