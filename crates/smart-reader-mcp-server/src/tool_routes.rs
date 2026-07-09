//! Explicit shipped routing table for smart-reader-mcp primary tools.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolRoute {
    RustCore,
    LegacyOptIn,
}

pub fn route_for_tool(tool: &str) -> Option<ToolRoute> {
    match tool {
        "read_media" | "sniff_format" | "resolve_media_path" => Some(ToolRoute::RustCore),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_read_media_to_rust_core() {
        assert_eq!(route_for_tool("read_media"), Some(ToolRoute::RustCore));
        assert_eq!(route_for_tool("sniff_format"), Some(ToolRoute::RustCore));
    }
}