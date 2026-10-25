//! The generator contract implemented by each target language.

use std::path::PathBuf;

use crate::error::CodegenError;
use crate::model::Model;

/// User-controlled options shared by all generators.
#[derive(Debug, Clone)]
pub struct GenerateOptions {
    /// Overrides the package/crate name derived from the spec name.
    pub crate_name: Option<String>,
    /// Generates only this domain (plus the items it depends on).
    pub domain: Option<String>,
    /// Package version written to the generated manifest.
    pub version: String,
    /// Directory containing template overrides (mirrors the embedded layout).
    pub templates: Option<PathBuf>,
}

impl Default for GenerateOptions {
    fn default() -> Self {
        Self {
            crate_name: None,
            domain: None,
            version: "0.1.0".into(),
            templates: None,
        }
    }
}

/// A file produced by a generator.
#[derive(Debug, Clone)]
pub struct GeneratedFile {
    /// Path relative to the generated package root.
    pub path: PathBuf,
    pub contents: String,
}

impl GeneratedFile {
    pub fn new(path: impl Into<PathBuf>, contents: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            contents: contents.into(),
        }
    }
}

/// Everything a generator produced for one spec.
#[derive(Debug, Clone)]
pub struct GeneratedOutput {
    /// Name of the generated package (the recommended output directory name).
    pub package_name: String,
    pub files: Vec<GeneratedFile>,
    /// Non-fatal issues discovered while generating.
    pub warnings: Vec<String>,
}

/// A target language.
pub trait Generator {
    /// CLI-facing language name, e.g. `rust`.
    fn language(&self) -> &'static str;

    /// Default templates embedded in the binary. Names are relative paths.
    fn default_templates(&self) -> &'static [(&'static str, &'static str)];

    /// Renders the whole package.
    fn generate(
        &self,
        model: &Model,
        options: &GenerateOptions,
    ) -> Result<GeneratedOutput, CodegenError>;
}
