use rmcp::ServiceExt;
use smart_reader_mcp_server::{SmartReaderMcp, SERVER_VERSION};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if std::env::args().nth(1).as_deref() == Some("doctor") {
        eprintln!(
            "smart-reader-mcp Rust MCP server {SERVER_VERSION} ({})",
            smart_reader_core::ENGINE_NAME
        );
        return Ok(());
    }

    let service = SmartReaderMcp::new().serve(rmcp::transport::stdio()).await?;
    service.waiting().await?;
    Ok(())
}