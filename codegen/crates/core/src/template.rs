//! MiniJinja plumbing: embedded defaults, on-disk overrides and case filters.

use std::path::{Path, PathBuf};

use minijinja::Environment;
use serde::Serialize;

use crate::error::CodegenError;
use crate::naming;

/// A ready-to-render set of templates.
///
/// Templates are keyed by their relative path (for example
/// `rust/events.rs.j2`). Every embedded default can be replaced by a file with
/// the same key under the override directory, which is how users customise the
/// output without forking the generator.
pub struct TemplateSet {
    env: Environment<'static>,
}

impl TemplateSet {
    pub fn new(
        embedded: &'static [(&'static str, &'static str)],
        overrides: Option<&Path>,
    ) -> Result<Self, CodegenError> {
        let mut env = Environment::new();
        env.set_keep_trailing_newline(true);
        env.add_filter("pascal", |value: String| naming::pascal_case(&value));
        env.add_filter("camel", |value: String| naming::camel_case(&value));
        env.add_filter("snake", |value: String| naming::snake_case(&value));
        env.add_filter("kebab", |value: String| naming::kebab_case(&value));
        env.add_filter("shouty_snake", |value: String| {
            naming::shouty_snake_case(&value)
        });
        env.add_filter("str_lit", |value: String| string_literal(&value));

        for (name, source) in embedded {
            env.add_template_owned((*name).to_string(), (*source).to_string())
                .map_err(|error| CodegenError::RenderTemplate {
                    name: (*name).to_string(),
                    message: error.to_string(),
                })?;
        }

        if let Some(directory) = overrides {
            if directory.exists() {
                load_overrides(&mut env, directory)?;
            }
        }

        Ok(Self { env })
    }

    /// Renders `name` with `context`.
    pub fn render<T: Serialize>(&self, name: &str, context: &T) -> Result<String, CodegenError> {
        let template = self
            .env
            .get_template(name)
            .map_err(|_| CodegenError::MissingTemplate {
                name: name.to_string(),
            })?;
        template
            .render(context)
            .map_err(|error| CodegenError::RenderTemplate {
                name: name.to_string(),
                message: error.to_string(),
            })
    }
}

/// Renders a Rust/TOML string literal, including the surrounding quotes.
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

fn load_overrides(env: &mut Environment<'static>, directory: &Path) -> Result<(), CodegenError> {
    let mut files = Vec::new();
    collect_templates(directory, &mut files)?;
    files.sort();

    for path in files {
        let relative = path
            .strip_prefix(directory)
            .unwrap_or(&path)
            .components()
            .map(|component| component.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/");
        let source = std::fs::read_to_string(&path).map_err(|source| CodegenError::ReadFile {
            path: path.clone(),
            source,
        })?;
        env.remove_template(&relative);
        env.add_template_owned(relative, source)
            .map_err(|error| CodegenError::RenderTemplate {
                name: path.display().to_string(),
                message: error.to_string(),
            })?;
    }
    Ok(())
}

fn collect_templates(directory: &Path, files: &mut Vec<PathBuf>) -> Result<(), CodegenError> {
    let entries = std::fs::read_dir(directory).map_err(|source| CodegenError::ReadFile {
        path: directory.to_path_buf(),
        source,
    })?;
    for entry in entries {
        let entry = entry.map_err(|source| CodegenError::ReadFile {
            path: directory.to_path_buf(),
            source,
        })?;
        let path = entry.path();
        if path.is_dir() {
            collect_templates(&path, files)?;
        } else if path.extension().is_some_and(|extension| extension == "j2") {
            files.push(path);
        }
    }
    Ok(())
}
