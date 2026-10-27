use std::collections::HashSet;
use std::io::Write;
use std::process::{Command, Stdio};

use em_codegen_core::error::CodegenError;
use em_codegen_core::generator::{GenerateOptions, GeneratedFile, GeneratedOutput, Generator};
use em_codegen_core::model::Model;
use em_codegen_core::naming;
use em_codegen_core::template::TemplateSet;

use crate::TEMPLATES;
use crate::context::{self, CrateCtx, DomainCtx, StateCtx};

/// Generates a self-contained Rust library crate from a spec.
#[derive(Debug, Default, Clone, Copy)]
pub struct RustGenerator;

impl Generator for RustGenerator {
    fn language(&self) -> &'static str {
        "rust"
    }

    fn default_templates(&self) -> &'static [(&'static str, &'static str)] {
        TEMPLATES
    }

    fn generate(
        &self,
        model: &Model,
        options: &GenerateOptions,
    ) -> Result<GeneratedOutput, CodegenError> {
        let (ctx, warnings) = context::build(model, options)?;
        validate_names(&ctx)?;

        let templates = TemplateSet::new(TEMPLATES, options.templates.as_deref())?;
        let mut files = Vec::new();
        // A single-domain crate puts the selected domain's modules at the crate
        // root instead of nesting them under `domains/<domain>`.
        let root_layout = ctx.domain.is_some();

        for (template, output) in ROOT_FILES {
            if root_layout && *output == "src/domains/mod.rs" {
                continue;
            }
            let contents = templates.render(template, &ctx)?;
            files.push(rendered_file(output, contents, &ctx));
        }

        for domain in &ctx.domains {
            if root_layout {
                push_domain_files(&templates, domain, "src", &mut files, &ctx, true)?;
            } else {
                let base = format!("src/domains/{}", domain.module);
                push_domain_files(&templates, domain, &base, &mut files, &ctx, false)?;
            }
        }

        if let Some(shared) = &ctx.shared {
            push_domain_files(&templates, shared, "src/shared", &mut files, &ctx, false)?;
        }

        Ok(GeneratedOutput {
            package_name: ctx.package_name.clone(),
            files,
            migrations: build_migrations(&ctx),
            warnings,
        })
    }
}

/// Files rendered exactly once per spec, relative to the crate root.
const ROOT_FILES: &[(&str, &str)] = &[
    ("rust/Cargo.toml.j2", "Cargo.toml"),
    ("rust/lib.rs.j2", "src/lib.rs"),
    ("rust/action.rs.j2", "src/action.rs"),
    ("rust/actors.rs.j2", "src/actors.rs"),
    ("rust/domains/mod.rs.j2", "src/domains/mod.rs"),
    ("rust/README.md.j2", "README.md"),
    ("rust/.gitignore.j2", ".gitignore"),
];

/// Files rendered once per domain (and once for the synthetic `shared` module).
const DOMAIN_FILES: &[(&str, &str)] = &[
    ("rust/domains/domain.rs.j2", "mod.rs"),
    ("rust/types.rs.j2", "types.rs"),
    ("rust/events.rs.j2", "events.rs"),
    ("rust/commands.rs.j2", "commands.rs"),
    ("rust/queries.rs.j2", "queries.rs"),
    ("rust/states.rs.j2", "states.rs"),
    ("rust/views.rs.j2", "views.rs"),
    ("rust/services.rs.j2", "services.rs"),
];

fn push_domain_files(
    templates: &TemplateSet,
    domain: &DomainCtx,
    base: &str,
    files: &mut Vec<GeneratedFile>,
    ctx: &CrateCtx,
    root_layout: bool,
) -> Result<(), CodegenError> {
    for (template, file) in DOMAIN_FILES {
        // The selected domain's modules live directly at the crate root, so
        // there is no per-domain `mod.rs` to write.
        if root_layout && *file == "mod.rs" {
            continue;
        }
        // Views are optional: a spec with no View cards should not leave an
        // empty `views.rs` (and `pub mod views;`) behind.
        if *file == "views.rs" && domain.views.is_empty() {
            continue;
        }
        let contents = templates.render(template, domain)?;
        files.push(rendered_file(&format!("{base}/{file}"), contents, ctx));
    }
    Ok(())
}

/// Builds one migration per generated view.
fn build_migrations(ctx: &CrateCtx) -> Vec<GeneratedFile> {
    let mut files = Vec::new();
    for domain in ctx.domains.iter().chain(ctx.shared.iter()) {
        for view in &domain.views {
            if view.table.is_empty() {
                continue;
            }
            let version = migration_version(&domain.module, &view.table);
            let file_name = format!(
                "{version}_{}_{}.sql",
                sanitize_file_component(&domain.module),
                sanitize_file_component(&view.table)
            );
            files.push(GeneratedFile::new(file_name, render_migration(ctx, view)));
        }
    }
    files
}

fn render_migration(ctx: &CrateCtx, view: &StateCtx) -> String {
    let mut seen = HashSet::new();
    let mut definitions = Vec::new();

    for field in view.params.iter().chain(view.states.iter()) {
        let column = naming::snake_case(&field.name);
        if !seen.insert(column.clone()) {
            continue;
        }
        let nullability = if field.required { " NOT NULL" } else { "" };
        definitions.push(format!("    {column} {}{nullability}", field.sql_type));
    }

    for (column, definition) in [
        ("last_event_position", "BIGINT NOT NULL DEFAULT 0"),
        ("created_at", "TIMESTAMPTZ NOT NULL DEFAULT NOW()"),
        ("updated_at", "TIMESTAMPTZ NOT NULL DEFAULT NOW()"),
    ] {
        if seen.insert(column.to_string()) {
            definitions.push(format!("    {column} {definition}"));
        }
    }

    if !view.key_columns.is_empty() {
        definitions.push(format!("    PRIMARY KEY ({})", view.key_columns.join(", ")));
    }

    let mut sql = generated_header(&format!("{}.sql", view.table), ctx);
    sql.push_str(&format!(
        "CREATE TABLE IF NOT EXISTS {} (\n{}\n);\n",
        view.table,
        definitions.join(",\n")
    ));

    for index in &view.indexes {
        let unique = if index.unique { "UNIQUE " } else { "" };
        sql.push_str(&format!(
            "\nCREATE {unique}INDEX IF NOT EXISTS {} ON {} ({});\n",
            index.name,
            view.table,
            index.columns.join(", ")
        ));
    }

    sql
}

/// Produces a stable, timestamp-shaped migration version from the domain and
/// table name. Stable output keeps regeneration from creating new migrations.
fn migration_version(domain: &str, table: &str) -> u64 {
    const BASE_DATE: u64 = 20_260_101;
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in domain
        .bytes()
        .chain(std::iter::once(b':'))
        .chain(table.bytes())
    {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }

    let seconds = hash % 86_400;
    let hours = seconds / 3_600;
    let minutes = (seconds % 3_600) / 60;
    let seconds = seconds % 60;
    BASE_DATE * 1_000_000 + hours * 10_000 + minutes * 100 + seconds
}

fn sanitize_file_component(value: &str) -> String {
    value
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn rendered_file(path: &str, contents: String, ctx: &CrateCtx) -> GeneratedFile {
    let contents = format!("{}{contents}", generated_header(path, ctx));
    let contents = if path.ends_with(".rs") {
        format_rust(&contents)
    } else {
        contents
    };
    GeneratedFile::new(path, contents)
}

/// A header that marks the file as generated. The comment syntax follows the
/// file type so the header stays valid in Rust, TOML, Markdown and dotfiles.
fn generated_header(path: &str, ctx: &CrateCtx) -> String {
    let note = format!(
        "Generated by `em-codegen` {} from the `{}` specification.",
        ctx.generator_version, ctx.spec_name
    );
    let warning = "Do not edit this file by hand; regenerate it instead.";

    if path.ends_with(".rs") {
        format!("// {note}\n// {warning}\n\n")
    } else if path.ends_with(".md") {
        format!("<!-- {note} -->\n<!-- {warning} -->\n\n")
    } else if path.ends_with(".sql") {
        format!("-- {note}\n-- {warning}\n\n")
    } else {
        format!("# {note}\n# {warning}\n\n")
    }
}

/// Formats generated Rust with `rustfmt`, falling back to [`tidy_rust`] when
/// the formatter is unavailable or fails.
fn format_rust(source: &str) -> String {
    let Ok(mut child) = Command::new("rustfmt")
        .args(["--edition", "2024", "--emit", "stdout", "--quiet"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        return tidy_rust(source);
    };

    if let Some(mut stdin) = child.stdin.take()
        && stdin.write_all(source.as_bytes()).is_err()
    {
        let _ = child.kill();
        return tidy_rust(source);
    }

    match child.wait_with_output() {
        Ok(output) if output.status.success() => {
            String::from_utf8(output.stdout).unwrap_or_else(|_| tidy_rust(source))
        }
        _ => tidy_rust(source),
    }
}

/// Collapses runs of blank lines and trailing whitespace so the generated Rust
/// stays readable without a formatting pass.
fn tidy_rust(source: &str) -> String {
    let mut out = String::with_capacity(source.len());
    let mut blank_run = 0usize;

    for line in source.lines() {
        let line = line.trim_end();
        if line.is_empty() {
            blank_run += 1;
            if blank_run > 1 {
                continue;
            }
        } else {
            blank_run = 0;
        }
        out.push_str(line);
        out.push('\n');
    }

    while out.ends_with('\n') {
        out.pop();
    }
    out.push('\n');
    out
}

/// Fails early, with a readable message, when a spec would produce two
/// top-level items with the same name in the same module.
fn validate_names(ctx: &CrateCtx) -> Result<(), CodegenError> {
    for domain in ctx.domains.iter().chain(ctx.shared.iter()) {
        let prefix = if domain.name == "shared" {
            "shared".to_string()
        } else if ctx.domain.is_some() {
            "crate root".to_string()
        } else {
            format!("domains::{}", domain.module)
        };

        check_unique(
            &format!("{prefix}::types"),
            domain.types.iter().map(|ty| ty.rust_name.clone()),
        )?;

        check_unique(
            &format!("{prefix}::events"),
            domain.events.iter().map(|event| event.rust_name.clone()),
        )?;

        check_unique(
            &format!("{prefix}::commands"),
            domain
                .commands
                .iter()
                .flat_map(|command| [command.rust_name.clone(), command.response_name.clone()]),
        )?;

        check_unique(
            &format!("{prefix}::queries"),
            domain
                .queries
                .iter()
                .flat_map(|query| [query.params_name.clone(), query.response_name.clone()]),
        )?;

        check_unique(
            &format!("{prefix}::states"),
            domain.states.iter().map(|state| state.rust_name.clone()),
        )?;

        check_unique(
            &format!("{prefix}::views"),
            domain.views.iter().map(|view| view.rust_name.clone()),
        )?;

        check_unique(
            &format!("{prefix}::services"),
            domain.services.iter().flat_map(|service| {
                service
                    .methods
                    .iter()
                    .flat_map(|method| [method.params_name.clone(), method.returns_name.clone()])
                    .chain(std::iter::once(service.trait_name.clone()))
            }),
        )?;

        // Enum variants are scoped to their enum, but still have to be unique.
        for ty in &domain.types {
            if ty.kind == "enum" {
                check_unique(
                    &format!("{prefix}::types::{}", ty.rust_name),
                    ty.variants.iter().map(|variant| variant.rust_name.clone()),
                )?;
            }
        }
    }

    check_unique(
        "domains",
        ctx.domains.iter().map(|domain| domain.module_ident.clone()),
    )?;

    check_unique(
        "actors",
        ctx.actors.iter().map(|actor| actor.rust_name.clone()),
    )?;

    Ok(())
}

fn check_unique(module: &str, names: impl IntoIterator<Item = String>) -> Result<(), CodegenError> {
    let mut seen = HashSet::new();
    for name in names {
        if !seen.insert(name.clone()) {
            return Err(CodegenError::NameCollision {
                module: module.to_string(),
                name,
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_rust_with_rustfmt() {
        let source = "fn main(){println!(\"hi\");}\n";
        assert_eq!(
            format_rust(source),
            "fn main() {\n    println!(\"hi\");\n}\n"
        );
    }
}
