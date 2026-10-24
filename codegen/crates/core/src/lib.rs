//! The language-independent half of the code generator.
//!
//! * [`spec`] mirrors the `*.spec.yaml` document contract.
//! * [`model`] validates and normalises a spec into a [`model::Model`] that
//!   every language generator consumes.
//! * [`template`] wraps a MiniJinja environment with the shared case filters.
//! * [`generator`] defines the [`generator::Generator`] contract.

pub mod error;
pub mod generator;
pub mod model;
pub mod naming;
pub mod spec;
pub mod template;

pub use error::CodegenError;
