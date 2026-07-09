use rmcp::model::CallToolResult;
use serde_json::Value;
use smart_reader_core::{read_media_from_value, ReadMediaErrorCode, READ_MEDIA_ROUTE};

pub fn read_media(args: Value) -> Result<CallToolResult, rmcp::ErrorData> {
    let response = read_media_from_value(&args).map_err(|error| match error.code {
        ReadMediaErrorCode::InvalidParams => rmcp::ErrorData::invalid_params(error.message, None),
        ReadMediaErrorCode::InvalidRequest => {
            rmcp::ErrorData::invalid_request(error.message, None)
        }
    })?;

    let structured = serde_json::json!({
        "tool": "read_media",
        "route": READ_MEDIA_ROUTE,
        "engine": smart_reader_core::ENGINE_NAME,
        "envelope": response.envelope,
    });

    Ok(CallToolResult::structured(structured))
}