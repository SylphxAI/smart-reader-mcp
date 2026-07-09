use rmcp::ServiceExt;
use smart_reader_mcp_server::{http_transport, SmartReaderMcp, SERVER_VERSION};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if std::env::args().nth(1).as_deref() == Some("doctor") {
        eprintln!(
            "smart-reader-mcp Rust MCP server {SERVER_VERSION} ({})",
            smart_reader_core::ENGINE_NAME
        );
        return Ok(());
    }

    if http_transport::transport_from_env().is_some() {
        return http_transport::serve_http(http_transport::HttpConfig::from_env()).await;
    }

    let service = SmartReaderMcp::new().serve(rmcp::transport::stdio()).await?;
    service.waiting().await?;
    Ok(())
}