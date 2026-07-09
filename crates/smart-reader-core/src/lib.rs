//! Rust media sniffing and path policy for smart-reader-mcp.

pub mod delegate;
pub mod envelope;
pub mod policy;
pub mod read_media;
pub mod sniff;

pub use read_media::{
    read_media_from_value, read_media_path, ReadMediaError, ReadMediaErrorCode, ReadMediaSuccess,
};
pub use envelope::READ_MEDIA_ROUTE;

pub const ENGINE_NAME: &str = "smart-reader-core";
pub const ENGINE_VERSION: &str = "0.1.0";