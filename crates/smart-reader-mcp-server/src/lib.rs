pub mod read_media;
pub mod tool_routes;

use rmcp::{
    handler::server::router::tool::ToolRouter,
    handler::server::wrapper::Parameters,
    model::{Implementation, ServerCapabilities, ServerInfo},
    tool, tool_handler, tool_router, ErrorData, ServerHandler,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// Free-form MCP tool args object (root type=object required by rmcp ≥1.8 schema gate).
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
struct FreeformToolArgs(Map<String, Value>);

impl FreeformToolArgs {
    fn into_value(self) -> Value {
        Value::Object(self.0)
    }
}

pub const SERVER_NAME: &str = "smart-reader-mcp";
pub const SERVER_VERSION: &str = "0.1.1";
pub const SERVER_INSTRUCTIONS: &str =
    "Smart reader MCP server (Rust rmcp transport). Use read_media to sniff format and delegate to the matching Sylphx Reader sibling with a provenance envelope.";

#[derive(Clone)]
pub struct SmartReaderMcp {
    pub tool_router: ToolRouter<Self>,
}

impl SmartReaderMcp {
    pub fn new() -> Self {
        Self {
            tool_router: Self::tool_router(),
        }
    }
}

#[tool_router]
impl SmartReaderMcp {
    #[tool(
        description = "Read a local PDF, image, or video by sniffing format and delegating to the matching Sylphx Reader sibling MCP package."
    )]
    fn read_media(
        &self,
        Parameters(args): Parameters<FreeformToolArgs>,
    ) -> Result<rmcp::model::CallToolResult, ErrorData> {
        read_media::read_media(args.into_value())
    }
}

#[tool_handler]
impl ServerHandler for SmartReaderMcp {
    fn get_info(&self) -> ServerInfo {
        // rmcp >=1.8: ServerInfo/Implementation are #[non_exhaustive] — use builders only.
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(
                Implementation::new(SERVER_NAME, SERVER_VERSION)
                    .with_description(
                        "Rust-native MCP server for smart-reader-mcp (modelcontextprotocol/rust-sdk rmcp)",
                    )
                    .with_website_url("https://github.com/SylphxAI/smart-reader-mcp"),
            )
            .with_instructions(SERVER_INSTRUCTIONS)
    }
}

#[cfg(test)]
mod tests {
    use super::SmartReaderMcp;
    #[test]
    fn exposes_read_media_tool_surface() {
        let tools = SmartReaderMcp::new().tool_router.list_all();
        let names: Vec<_> = tools.iter().map(|tool| tool.name.to_string()).collect();
        assert!(names.contains(&"read_media".to_string()));
    }
}
