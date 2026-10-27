//! `em-codegen` — generate modules, crates and libraries from a spec.
//!
//! ```text
//! em-codegen generate samples/authentication.spec.yaml --out generated/authentication
//! em-codegen generate samples/authentication.spec.yaml --domain account
//! em-codegen templates --out my-templates
//! em-codegen generate samples/authentication.spec.yaml --templates my-templates
//! ```

use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use clap::{Parser, Subcommand};
use em_codegen_core::error::CodegenError;
use em_codegen_core::generator::{GenerateOptions, Generator};
use em_codegen_core::model::load_spec;
use em_codegen_rust::RustGenerator;

#[derive(Debug, Parser)]
#[command(
    name = "em-codegen",
    version,
    about = "Generate a typed library from an event-modeling specification",
    long_about = None
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    /// Generate a package from a `*.spec.yaml` document.
    Generate {
        /// Path to the specification.
        spec: PathBuf,

        /// Target language.
        #[arg(long, short = 'l', default_value = "rust")]
        lang: String,

        /// Output directory. Defaults to `generated/<package-name>`.
        #[arg(long, short = 'o')]
        out: Option<PathBuf>,

        /// Override the generated package name.
        #[arg(long)]
        name: Option<String>,

        /// Generate only this domain (plus the items it depends on).
        #[arg(long, short = 'd', value_name = "NAME")]
        domain: Option<String>,

        /// Directory containing template overrides (same layout as the defaults).
        #[arg(long, value_name = "DIR")]
        templates: Option<PathBuf>,

        /// Directory that receives generated SQL migrations.
        #[arg(long, value_name = "DIR")]
        migrations: Option<PathBuf>,

        /// Overwrite files in a non-empty output directory.
        #[arg(long)]
        force: bool,

        /// Print the files that would be written, without touching the disk.
        #[arg(long)]
        dry_run: bool,
    },

    /// Write the embedded default templates to a directory for customisation.
    Templates {
        /// Target language.
        #[arg(long, short = 'l', default_value = "rust")]
        lang: String,

        /// Directory that receives the template tree.
        #[arg(long, short = 'o')]
        out: PathBuf,

        /// Overwrite files in a non-empty directory.
        #[arg(long)]
        force: bool,
    },

    /// List the available target languages.
    Languages,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Generate {
            spec,
            lang,
            out,
            name,
            domain,
            templates,
            migrations,
            force,
            dry_run,
        } => {
            let options = GenerateOptions {
                crate_name: name,
                domain,
                templates,
                ..GenerateOptions::default()
            };
            generate(&spec, &lang, out, migrations, options, force, dry_run)
        }
        Commands::Templates { lang, out, force } => dump_templates(&lang, &out, force),
        Commands::Languages => {
            for generator in generators() {
                println!("{}", generator.language());
            }
            Ok(())
        }
    }
}

fn generators() -> Vec<Box<dyn Generator>> {
    vec![Box::new(RustGenerator)]
}

fn find_generator(language: &str) -> Result<Box<dyn Generator>> {
    let language = language.to_ascii_lowercase();
    generators()
        .into_iter()
        .find(|generator| generator.language() == language)
        .ok_or_else(|| {
            let available = generators()
                .iter()
                .map(|generator| generator.language())
                .collect::<Vec<_>>()
                .join(", ");
            CodegenError::UnknownLanguage {
                language,
                available,
            }
            .into()
        })
}

fn generate(
    spec_path: &Path,
    language: &str,
    out: Option<PathBuf>,
    migrations: Option<PathBuf>,
    options: GenerateOptions,
    force: bool,
    dry_run: bool,
) -> Result<()> {
    let generator = find_generator(language)?;
    let loaded = load_spec(spec_path)?;
    print_warnings(loaded.warnings());

    let output = generator.generate(&loaded.model, &options)?;
    print_warnings(&output.warnings);

    let out_dir = out.unwrap_or_else(|| PathBuf::from("generated").join(&output.package_name));
    let migrations_dir = migrations.unwrap_or_else(|| out_dir.join("migrations"));

    if dry_run {
        println!(
            "Would generate {} `{}` ({} files) in {}:",
            generator.language(),
            output.package_name,
            output.files.len(),
            out_dir.display()
        );
        for file in &output.files {
            println!("  {}", out_dir.join(&file.path).display());
        }
        for file in &output.migrations {
            println!("  {}", migrations_dir.join(&file.path).display());
        }
        return Ok(());
    }

    ensure_writable(&out_dir, force)?;
    for file in &output.files {
        write_file(&out_dir.join(&file.path), &file.contents)?;
    }

    if !output.migrations.is_empty() {
        for file in &output.migrations {
            write_file(&migrations_dir.join(&file.path), &file.contents)?;
        }
        println!(
            "Generated {} migrations in {}",
            output.migrations.len(),
            migrations_dir.display()
        );
    }

    println!(
        "Generated {} `{}` ({} files) in {}",
        generator.language(),
        output.package_name,
        output.files.len(),
        out_dir.display()
    );
    Ok(())
}

fn dump_templates(language: &str, out_dir: &Path, force: bool) -> Result<()> {
    let generator = find_generator(language)?;
    ensure_writable(out_dir, force)?;

    let templates = generator.default_templates();
    for (name, contents) in templates {
        write_file(&out_dir.join(name), contents)?;
    }
    println!(
        "Wrote {} default {} templates to {}",
        templates.len(),
        generator.language(),
        out_dir.display()
    );
    println!(
        "Customise them, then pass `--templates {}` to `generate`.",
        out_dir.display()
    );
    Ok(())
}

fn print_warnings(warnings: &[String]) {
    for warning in warnings {
        eprintln!("warning: {warning}");
    }
}

fn ensure_writable(out_dir: &Path, force: bool) -> Result<()> {
    if force || !out_dir.exists() {
        return Ok(());
    }
    let mut entries = std::fs::read_dir(out_dir)
        .with_context(|| format!("failed to read {}", out_dir.display()))?;
    if entries.next().is_some() {
        bail!(CodegenError::OutputNotEmpty {
            path: out_dir.to_path_buf(),
        });
    }
    Ok(())
}

fn write_file(path: &Path, contents: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("failed to create {}", parent.display()))?;
    }
    std::fs::write(path, contents).map_err(|source| CodegenError::WriteFile {
        path: path.to_path_buf(),
        source,
    })?;
    Ok(())
}
