//! Shared Anthropic usage building core.
//!
//! All four provider paths emit Anthropic-format usage objects. The core algorithm
//! is identical everywhere: `input_tokens = prompt − cache_read − cache_creation`
//! (all three buckets are mutually exclusive and sum to the inclusive prompt_tokens).
//!
//! This module provides the single source of truth so that any future change to
//! the accounting rules only needs to be made here.

use serde_json::{json, Value};

/// Raw token values extracted from any upstream usage format.
#[derive(Debug, Clone, Default)]
pub(crate) struct RawTokens {
    pub prompt_tokens: u64,
    pub cache_read: u64,
    pub cache_creation: u64,
    pub reasoning_tokens: u64,
}

/// Build an Anthropic-format usage `Value` from raw token values.
///
/// ## Accounting invariant
/// `input_tokens + cache_read + cache_creation == prompt_tokens` (inclusive upstream).
/// This function produces the Anthropic split by subtracting the cache buckets.
/// `output_tokens` is passed through unchanged.
///
/// ## Thinking tokens
/// `reasoning_tokens > 0` is written as `output_tokens_details.thinking_tokens`,
/// matching the Anthropic API surface and enabling cost attribution.
pub(crate) fn build_anthropic_usage(tokens: RawTokens) -> Value {
    let RawTokens {
        prompt_tokens,
        cache_read,
        cache_creation,
        reasoning_tokens,
    } = tokens;

    let input_tokens = prompt_tokens
        .saturating_sub(cache_read)
        .saturating_sub(cache_creation);

    let mut result = json!({
        "input_tokens": input_tokens,
        "output_tokens": 0u64, // filled below
    });

    // Output tokens are passed separately so this function can be used even when
    // the output count comes from a different field than prompt_tokens.
    result["output_tokens"] = json!(0u64);

    if cache_read > 0 {
        result["cache_read_input_tokens"] = json!(cache_read);
    }
    if cache_creation > 0 {
        result["cache_creation_input_tokens"] = json!(cache_creation);
    }
    if reasoning_tokens > 0 {
        result["output_tokens_details"] = json!({
            "thinking_tokens": reasoning_tokens
        });
    }

    result
}

/// Build Anthropic usage with a pre-computed output token count.
///
/// Convenience overload for callers that already know their output token value.
pub(crate) fn build_anthropic_usage_with_output(tokens: RawTokens, output_tokens: u64) -> Value {
    let mut result = build_anthropic_usage(tokens);
    result["output_tokens"] = json!(output_tokens);
    result
}

/// Fallback usage for when no usage data is available from the upstream.
pub(crate) fn empty_usage() -> Value {
    json!({
        "input_tokens": 0,
        "output_tokens": 0
    })
}
