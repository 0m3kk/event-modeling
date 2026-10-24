use std::collections::HashSet;

use em_codegen_core::error::CodegenError;
use em_codegen_core::generator::{GenerateOptions, GeneratedFile, GeneratedOutput, Generator};
use em_codegen_core::model::Model;
use em_codegen_core::template::TemplateSet;

use crate::TEMPLATES;
use crate::context::{self, CrateCtx, DomainCtx};

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
        let (ctx, warnings) = context::build(model, options);
        validate_names(&ctx)?;

        let templates = TemplateSet::new(TEMPLATES, options.templates.as_deref())?;
        let mut files = Vec::new();

        for (template, output) in ROOT_FILES {
            let contents = templates.render(template, &ctx)?;
            files.push(rendered_file(output, contents));
        }

        for domain in &ctx.domains {
            let base = format!("src/domains/{}", domain.module);
            push_domain_files(&templates, domain, &base, &mut files)?;
        }

        if let Some(shared) = &ctx.shared {
            push_domain_files(&templates, shared, "src/shared", &mut files)?;
        }

        Ok(GeneratedOutput {
            package_name: ctx.package_name.clone(),
            files,
            warnings,
        })
    }
}

/// Files rendered exactly once per spec, relative to the crate root.
const ROOT_FILES: &[(&str, &str)] = &[
    ("rust/Cargo.toml.j2", "Cargo.toml"),
    ("rust/lib.rs.j2", "src/lib.rs"),
    ("rust/domain_event.rs.j2", "src/domain_event.rs"),
    ("rust/actors.rs.j2", "src/actors.rs"),
    ("rust/tags.rs.j2", "src/tags.rs"),
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
    ("rust/services.rs.j2", "services.rs"),
];

fn push_domain_files(
    templates: &TemplateSet,
    domain: &DomainCtx,
    base: &str,
    files: &mut Vec<GeneratedFile>,
) -> Result<(), CodegenError> {
    for (template, file) in DOMAIN_FILES {
        let contents = templates.render(template, domain)?;
        files.push(rendered_file(&format!("{base}/{file}"), contents));
    }
    Ok(())
}

fn rendered_file(path: &str, contents: String) -> GeneratedFile {
    let contents = if path.ends_with(".rs") {
        tidy_rust(&contents)
    } else {
        contents
    };
    GeneratedFile::new(path, contents)
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
            domain
                .states
                .iter()
                .flat_map(|state| [state.rust_name.clone(), state.params_name.clone()]),
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
        "tags",
        ctx.tags
            .iter()
            .map(|tag| tag.const_name.clone())
            .chain(std::iter::once("TagDefinition".to_string())),
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
