//! Case helpers shared by every generator.
//!
//! They mirror `packages/spec/src/naming.ts` so a card named `OrderPlaced`,
//! `order_placed` or `Order Placed` maps to the same generated identifier.

use heck::{ToKebabCase, ToLowerCamelCase, ToShoutySnakeCase, ToSnakeCase, ToUpperCamelCase};

/// Collapses casing and separators, e.g. `OrderPlaced` -> `order_placed`.
pub fn name_key(name: &str) -> String {
    name.trim().to_snake_case()
}

/// `OrderPlaced` -> `OrderPlaced`.
pub fn pascal_case(name: &str) -> String {
    name.to_upper_camel_case()
}

/// `OrderPlaced` -> `orderPlaced`.
pub fn camel_case(name: &str) -> String {
    name.to_lower_camel_case()
}

/// `OrderPlaced` -> `order_placed`.
pub fn snake_case(name: &str) -> String {
    name.to_snake_case()
}

/// `OrderPlaced` -> `order-placed`.
pub fn kebab_case(name: &str) -> String {
    name.to_kebab_case()
}

/// `OrderPlaced` -> `ORDER_PLACED`.
pub fn shouty_snake_case(name: &str) -> String {
    name.to_shouty_snake_case()
}

/// Returns `base`, or `base_2`, `base_3`, ... until it is unused.
pub fn unique_name(base: &str, used: &mut std::collections::HashSet<String>) -> String {
    if used.insert(base.to_string()) {
        return base.to_string();
    }
    let mut index = 2;
    loop {
        let candidate = format!("{base}_{index}");
        if used.insert(candidate.clone()) {
            return candidate;
        }
        index += 1;
    }
}
