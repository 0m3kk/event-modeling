use std::path::PathBuf;

use thiserror::Error;

/// Everything that can go wrong while loading a spec or rendering a generator.
#[derive(Debug, Error)]
pub enum CodegenError {
    #[error("failed to read specification `{path}`: {source}")]
    ReadSpec {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("failed to read `{path}`: {source}")]
    ReadFile {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("failed to parse specification `{path}`: {message}")]
    ParseSpec { path: PathBuf, message: String },

    #[error("unknown generator language `{language}` (available: {available})")]
    UnknownLanguage { language: String, available: String },

    #[error("template `{name}` is not available")]
    MissingTemplate { name: String },

    #[error("failed to render template `{name}`: {message}")]
    RenderTemplate { name: String, message: String },

    #[error("generated name collision in module `{module}`: `{name}` is produced more than once")]
    NameCollision { module: String, name: String },

    #[error("failed to write `{path}`: {source}")]
    WriteFile {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("output directory `{path}` already exists and is not empty; pass --force to overwrite")]
    OutputNotEmpty { path: PathBuf },
}
