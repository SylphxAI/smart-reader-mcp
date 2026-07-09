use std::path::Path;

use serde::{Deserialize, Serialize};

pub const SNIFF_ROUTE: &str = "rust-sniff";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaCategory {
    Pdf,
    Image,
    Video,
    #[serde(rename = "unknown")]
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SniffResult {
    pub category: MediaCategory,
    pub format: String,
    pub mime_type: Option<String>,
    pub route: String,
}

fn starts_with(buffer: &[u8], signature: &[u8], offset: usize) -> bool {
    if buffer.len() < offset + signature.len() {
        return false;
    }
    buffer[offset..offset + signature.len()] == *signature
}

fn read_ascii(buffer: &[u8], start: usize, length: usize) -> String {
    let end = (start + length).min(buffer.len());
    String::from_utf8_lossy(&buffer[start..end]).into_owned()
}

fn sniff_from_magic_bytes(buffer: &[u8]) -> &'static str {
    if starts_with(buffer, b"%PDF", 0) {
        return "pdf";
    }
    if starts_with(buffer, &[0x89, 0x50, 0x4e, 0x47], 0) {
        return "image/png";
    }
    if starts_with(buffer, &[0xff, 0xd8, 0xff], 0) {
        return "image/jpeg";
    }
    let header = read_ascii(buffer, 0, 6);
    if header == "GIF87a" || header == "GIF89a" {
        return "image/gif";
    }
    if starts_with(buffer, b"RIFF", 0) && read_ascii(buffer, 8, 4) == "WEBP" {
        return "image/webp";
    }
    if starts_with(buffer, &[0x49, 0x49, 0x2a, 0x00], 0)
        || starts_with(buffer, &[0x4d, 0x4d, 0x00, 0x2a], 0)
    {
        return "image/tiff";
    }
    if starts_with(buffer, &[0x1a, 0x45, 0xdf, 0xa3], 0) {
        if buffer.len() >= 40 && read_ascii(buffer, 31, 4) == "webm" {
            return "video/webm";
        }
        return "video/mkv";
    }
    if buffer.len() >= 12 && read_ascii(buffer, 4, 4) == "ftyp" {
        let brand = read_ascii(buffer, 8, 4);
        if brand == "qt  " {
            return "video/quicktime";
        }
        return "video/mp4";
    }
    "unknown"
}

fn sniff_from_extension(file_path: &Path) -> &'static str {
    match file_path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_lowercase)
        .as_deref()
    {
        Some("pdf") => "pdf",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("tif") | Some("tiff") => "image/tiff",
        Some("mp4") | Some("m4v") => "video/mp4",
        Some("mkv") => "video/mkv",
        Some("mov") => "video/quicktime",
        Some("webm") => "video/webm",
        _ => "unknown",
    }
}

fn category_for_format(format: &str) -> MediaCategory {
    match format {
        "pdf" => MediaCategory::Pdf,
        f if f.starts_with("image/") => MediaCategory::Image,
        f if f.starts_with("video/") => MediaCategory::Video,
        _ => MediaCategory::Unknown,
    }
}

fn mime_for_format(format: &str) -> Option<&'static str> {
    match format {
        "pdf" => Some("application/pdf"),
        "image/png" => Some("image/png"),
        "image/jpeg" => Some("image/jpeg"),
        "image/gif" => Some("image/gif"),
        "image/webp" => Some("image/webp"),
        "image/tiff" => Some("image/tiff"),
        "video/mp4" => Some("video/mp4"),
        "video/mkv" => Some("video/x-matroska"),
        "video/quicktime" => Some("video/quicktime"),
        "video/webm" => Some("video/webm"),
        _ => None,
    }
}

pub fn sniff_buffer(buffer: &[u8], file_path: Option<&Path>) -> SniffResult {
    let mut format = sniff_from_magic_bytes(buffer).to_string();
    if format == "unknown" {
        if let Some(path) = file_path {
            let extension_format = sniff_from_extension(path);
            if extension_format != "unknown" {
                format = extension_format.to_string();
            }
        }
    }

    SniffResult {
        category: category_for_format(&format),
        format: format.clone(),
        mime_type: mime_for_format(&format).map(str::to_string),
        route: SNIFF_ROUTE.into(),
    }
}

pub fn sniff_file(path: &Path) -> Result<SniffResult, String> {
    let bytes = std::fs::read(path).map_err(|err| format!("READ_FAILED: {err}"))?;
    let sample = &bytes[..bytes.len().min(64)];
    Ok(sniff_buffer(sample, Some(path)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn detects_pdf_magic_bytes() {
        let result = sniff_buffer(b"%PDF-1.7\n", None);
        assert_eq!(result.format, "pdf");
        assert_eq!(result.category, MediaCategory::Pdf);
        assert_eq!(result.route, SNIFF_ROUTE);
    }

    #[test]
    fn detects_png_despite_pdf_extension() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("png-as-pdf.pdf");
        let png = [
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        ];
        fs::write(&path, png).expect("write");
        let result = sniff_file(&path).expect("sniff");
        assert_eq!(result.format, "image/png");
        assert_eq!(result.category, MediaCategory::Image);
    }

    #[test]
    fn falls_back_to_extension_when_magic_unknown() {
        let result = sniff_buffer(b"unknown", Some(Path::new("/tmp/sample.PDF")));
        assert_eq!(result.format, "pdf");
    }
}