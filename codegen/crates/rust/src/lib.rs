//! Rust target: turns a normalised spec into a compiling library crate.
//!
//! The templates live next to this file and are embedded into the binary. A
//! user can copy them out with `em-codegen templates` and point
//! `em-codegen generate --templates <dir>` at the copy to customise the output.

mod context;
mod generator;

pub use generator::RustGenerator;

/// Embedded default templates, keyed by their path relative to the template root.
pub const TEMPLATES: &[(&str, &str)] = &[
    (
        "rust/Cargo.toml.j2",
        include_str!("../templates/Cargo.toml.j2"),
    ),
    ("rust/lib.rs.j2", include_str!("../templates/lib.rs.j2")),
    ("rust/types.rs.j2", include_str!("../templates/types.rs.j2")),
    (
        "rust/events.rs.j2",
        include_str!("../templates/events.rs.j2"),
    ),
    (
        "rust/commands.rs.j2",
        include_str!("../templates/commands.rs.j2"),
    ),
    (
        "rust/queries.rs.j2",
        include_str!("../templates/queries.rs.j2"),
    ),
    (
        "rust/states.rs.j2",
        include_str!("../templates/states.rs.j2"),
    ),
    (
        "rust/services.rs.j2",
        include_str!("../templates/services.rs.j2"),
    ),
    (
        "rust/domain_event.rs.j2",
        include_str!("../templates/domain_event.rs.j2"),
    ),
    (
        "rust/actors.rs.j2",
        include_str!("../templates/actors.rs.j2"),
    ),
    ("rust/tags.rs.j2", include_str!("../templates/tags.rs.j2")),
    (
        "rust/domains/mod.rs.j2",
        include_str!("../templates/domains/mod.rs.j2"),
    ),
    (
        "rust/domains/domain.rs.j2",
        include_str!("../templates/domains/domain.rs.j2"),
    ),
    (
        "rust/README.md.j2",
        include_str!("../templates/README.md.j2"),
    ),
    (
        "rust/.gitignore.j2",
        include_str!("../templates/.gitignore.j2"),
    ),
];
