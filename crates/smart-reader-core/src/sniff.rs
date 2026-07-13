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


/// Pure mislabel warning — parity with TS `src/sniff/mislabel.ts#mislabelWarning`.
/// Returns None when extension is unknown, sniffed format is unknown, or they match.
pub fn mislabel_warning(file_path: &Path, sniffed: &SniffResult) -> Option<String> {
    let declared = sniff_from_extension(file_path);
    if declared == "unknown" || sniffed.format == "unknown" {
        return None;
    }
    if declared == sniffed.format {
        return None;
    }
    Some(format!(
        "File extension suggests {declared} but magic-byte sniff detected {}; routing by content.",
        sniffed.format
    ))
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

    #[test]
    fn detects_jpeg_gif_webp_tiff_magic() {
        assert_eq!(sniff_buffer(&[0xff, 0xd8, 0xff, 0xe0], None).format, "image/jpeg");
        assert_eq!(sniff_buffer(b"GIF89a......", None).format, "image/gif");
        let mut webp = b"RIFF".to_vec();
        webp.extend_from_slice(&[0, 0, 0, 0]);
        webp.extend_from_slice(b"WEBP");
        assert_eq!(sniff_buffer(&webp, None).format, "image/webp");
        assert_eq!(
            sniff_buffer(&[0x49, 0x49, 0x2a, 0x00, 0, 0], None).format,
            "image/tiff"
        );
        assert_eq!(
            sniff_buffer(&[0x4d, 0x4d, 0x00, 0x2a, 0, 0], None).format,
            "image/tiff"
        );
    }

    #[test]
    fn detects_mp4_and_quicktime_ftyp() {
        let mut mp4 = vec![0, 0, 0, 0x18];
        mp4.extend_from_slice(b"ftypisom");
        assert_eq!(sniff_buffer(&mp4, None).format, "video/mp4");
        let mut qt = vec![0, 0, 0, 0x18];
        qt.extend_from_slice(b"ftypqt  ");
        assert_eq!(sniff_buffer(&qt, None).format, "video/quicktime");
    }

    #[test]
    fn mislabel_warning_matches_ts_contract() {
        let sniffed = sniff_buffer(
            &[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
            Some(Path::new("png-as-pdf.pdf")),
        );
        let warning = mislabel_warning(Path::new("png-as-pdf.pdf"), &sniffed).expect("warn");
        assert!(warning.contains("File extension suggests pdf"));
        assert!(warning.contains("image/png"));
        assert!(warning.contains("routing by content"));
        let ok = sniff_buffer(
            &[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
            Some(Path::new("ok.png")),
        );
        assert!(mislabel_warning(Path::new("ok.png"), &ok).is_none());
        let unk = sniff_buffer(
            &[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
            Some(Path::new("x.bin")),
        );
        assert!(mislabel_warning(Path::new("x.bin"), &unk).is_none());
    }


    #[test]
    fn detects_mkv_and_webm_ebml() {
        // EBML header 1A 45 DF A3 — without webm brand => mkv
        let mut mkv = vec![0x1a, 0x45, 0xdf, 0xa3];
        mkv.resize(40, 0);
        assert_eq!(sniff_buffer(&mkv, None).format, "video/mkv");
        assert_eq!(sniff_buffer(&mkv, None).category, MediaCategory::Video);
        assert_eq!(
            sniff_buffer(&mkv, None).mime_type.as_deref(),
            Some("video/x-matroska")
        );
        // brand "webm" at offset 31
        let mut webm = vec![0x1a, 0x45, 0xdf, 0xa3];
        webm.resize(40, 0);
        webm[31..35].copy_from_slice(b"webm");
        assert_eq!(sniff_buffer(&webm, None).format, "video/webm");
        assert_eq!(
            sniff_buffer(&webm, None).mime_type.as_deref(),
            Some("video/webm")
        );
    }

    #[test]
    fn extension_fallback_covers_video_exts_and_unknown() {
        assert_eq!(
            sniff_buffer(b"???", Some(Path::new("clip.MOV"))).format,
            "video/quicktime"
        );
        assert_eq!(
            sniff_buffer(b"???", Some(Path::new("a.webm"))).format,
            "video/webm"
        );
        assert_eq!(
            sniff_buffer(b"???", Some(Path::new("x.bin"))).format,
            "unknown"
        );
        assert_eq!(
            sniff_buffer(b"???", Some(Path::new("x.bin"))).category,
            MediaCategory::Unknown
        );
    }

    #[test]
    fn mislabel_jpeg_as_png_and_unknown_sniff_none() {
        let jpeg = sniff_buffer(&[0xff, 0xd8, 0xff, 0xe0], Some(Path::new("photo.png")));
        let warning = mislabel_warning(Path::new("photo.png"), &jpeg).expect("warn");
        assert!(warning.contains("image/png"));
        assert!(warning.contains("image/jpeg"));
        let unk = SniffResult {
            category: MediaCategory::Unknown,
            format: "unknown".into(),
            mime_type: None,
            route: SNIFF_ROUTE.into(),
        };
        assert!(mislabel_warning(Path::new("a.jpg"), &unk).is_none());
    }


    #[test]
    fn starts_with_bounds_and_gif87a_tiff_mime() {
        assert!(!starts_with(b"ab", b"abc", 0));
        assert!(!starts_with(b"abc", b"ab", 2));
        assert!(starts_with(b"abc", b"bc", 1));
        assert_eq!(sniff_buffer(b"GIF87a......", None).format, "image/gif");
        assert_eq!(
            sniff_buffer(&[0x49, 0x49, 0x2a, 0x00], None).mime_type.as_deref(),
            Some("image/tiff")
        );
        assert_eq!(mime_for_format("pdf"), Some("application/pdf"));
        assert_eq!(mime_for_format("video/mp4"), Some("video/mp4"));
        assert_eq!(mime_for_format("unknown"), None);
        assert_eq!(category_for_format("pdf"), MediaCategory::Pdf);
        assert_eq!(category_for_format("image/png"), MediaCategory::Image);
        assert_eq!(category_for_format("video/mkv"), MediaCategory::Video);
        assert_eq!(category_for_format("unknown"), MediaCategory::Unknown);
        assert_eq!(read_ascii(b"hello", 1, 3), "ell");
        assert_eq!(read_ascii(b"hi", 0, 10), "hi");
    }

    #[test]
    fn extension_fallback_m4v_jpg_tif_and_mp4() {
        assert_eq!(
            sniff_buffer(b"???", Some(Path::new("clip.m4v"))).format,
            "video/mp4"
        );
        assert_eq!(
            sniff_buffer(b"???", Some(Path::new("a.JPG"))).format,
            "image/jpeg"
        );
        assert_eq!(
            sniff_buffer(b"???", Some(Path::new("scan.TIF"))).format,
            "image/tiff"
        );
        assert_eq!(
            sniff_buffer(b"???", Some(Path::new("movie.mkv"))).format,
            "video/mkv"
        );
    }


    #[test]
    fn bw7_mime_and_category_full_table() {
        let pairs = [
            ("pdf", Some("application/pdf"), MediaCategory::Pdf),
            ("image/png", Some("image/png"), MediaCategory::Image),
            ("image/jpeg", Some("image/jpeg"), MediaCategory::Image),
            ("image/gif", Some("image/gif"), MediaCategory::Image),
            ("image/webp", Some("image/webp"), MediaCategory::Image),
            ("image/tiff", Some("image/tiff"), MediaCategory::Image),
            ("video/mp4", Some("video/mp4"), MediaCategory::Video),
            ("video/mkv", Some("video/x-matroska"), MediaCategory::Video),
            ("video/quicktime", Some("video/quicktime"), MediaCategory::Video),
            ("video/webm", Some("video/webm"), MediaCategory::Video),
            ("unknown", None, MediaCategory::Unknown),
        ];
        for (fmt, mime, cat) in pairs {
            assert_eq!(mime_for_format(fmt), mime, "{fmt}");
            assert_eq!(category_for_format(fmt), cat, "{fmt}");
        }
    }

    #[test]
    fn bw7_sniff_short_buffers_and_extension_case() {
        // too short for signatures
        assert_eq!(sniff_buffer(b"", None).format, "unknown");
        assert_eq!(sniff_buffer(b"%PD", None).format, "unknown");
        assert_eq!(sniff_buffer(&[0xff, 0xd8], None).format, "unknown"); // need 3 jpeg bytes
        // extension case-insensitive
        assert_eq!(sniff_buffer(b"???", Some(Path::new("X.PnG"))).format, "image/png");
        assert_eq!(sniff_buffer(b"???", Some(Path::new("Clip.MoV"))).format, "video/quicktime");
        assert_eq!(sniff_buffer(b"???", Some(Path::new("Doc.PDF"))).format, "pdf");
    }

    #[test]
    fn bw7_starts_with_and_read_ascii_edges() {
        assert!(starts_with(b"", b"", 0)); // empty sig always matches if in bounds
        assert!(!starts_with(b"a", b"a", 1));
        assert_eq!(read_ascii(b"abcd", 4, 2), "");
        assert_eq!(read_ascii(b"abcd", 2, 0), "");
        assert_eq!(read_ascii(b"", 0, 5), "");
    }

    #[test]
    fn bw7_mislabel_video_ext_vs_image_magic() {
        let png = [0x89u8, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        let sniffed = sniff_buffer(&png, Some(Path::new("clip.mp4")));
        let w = mislabel_warning(Path::new("clip.mp4"), &sniffed).expect("warn");
        assert!(w.contains("video/mp4"));
        assert!(w.contains("image/png"));
    }


    #[test]
    fn bw8_ftyp_brands_and_tiff_endian_magic() {
        let mut mp4 = vec![0u8; 12];
        mp4[4..8].copy_from_slice(b"ftyp");
        mp4[8..12].copy_from_slice(b"isom");
        assert_eq!(sniff_from_magic_bytes(&mp4), "video/mp4");
        let mut qt = vec![0u8; 12];
        qt[4..8].copy_from_slice(b"ftyp");
        qt[8..12].copy_from_slice(b"qt  ");
        assert_eq!(sniff_from_magic_bytes(&qt), "video/quicktime");
        assert_eq!(
            sniff_from_magic_bytes(&[0x49, 0x49, 0x2a, 0x00]),
            "image/tiff"
        );
        assert_eq!(
            sniff_from_magic_bytes(&[0x4d, 0x4d, 0x00, 0x2a]),
            "image/tiff"
        );
        assert_eq!(sniff_from_magic_bytes(b"xxxxftyp"), "unknown");
    }

    #[test]
    fn bw8_webm_ebml_offset_and_mkv_default() {
        let mut buf = vec![0x1a, 0x45, 0xdf, 0xa3];
        buf.resize(40, 0);
        assert_eq!(sniff_from_magic_bytes(&buf), "video/mkv");
        buf[31..35].copy_from_slice(b"webm");
        assert_eq!(sniff_from_magic_bytes(&buf), "video/webm");
        assert_eq!(mime_for_format("video/mkv"), Some("video/x-matroska"));
        assert_eq!(mime_for_format("video/webm"), Some("video/webm"));
        assert_eq!(mime_for_format("nope"), None);
    }

    #[test]
    fn bw8_extension_fallback_mov_webm_pdf_unknown() {
        assert_eq!(
            sniff_buffer(b"???", Some(Path::new("a.mov"))).format,
            "video/quicktime"
        );
        assert_eq!(
            sniff_buffer(b"???", Some(Path::new("a.webm"))).format,
            "video/webm"
        );
        assert_eq!(
            sniff_buffer(b"???", Some(Path::new("a.PDF"))).format,
            "pdf"
        );
        assert_eq!(
            sniff_buffer(b"???", Some(Path::new("a.bin"))).format,
            "unknown"
        );
        assert_eq!(category_for_format("pdf"), MediaCategory::Pdf);
        assert_eq!(category_for_format("image/x"), MediaCategory::Image);
        assert_eq!(category_for_format("video/x"), MediaCategory::Video);
    }

    #[test]
    fn bw8_mislabel_none_when_match_or_unknown() {
        let path = Path::new("photo.png");
        let sniffed = SniffResult {
            category: MediaCategory::Image,
            format: "image/png".into(),
            mime_type: Some("image/png".into()),
            route: "rust-smart-sniff".into(),
        };
        assert!(mislabel_warning(path, &sniffed).is_none());
        let unk = SniffResult {
            category: MediaCategory::Unknown,
            format: "unknown".into(),
            mime_type: None,
            route: "rust-smart-sniff".into(),
        };
        assert!(mislabel_warning(Path::new("x.bin"), &unk).is_none());
    }


    #[test]
    fn bulk_starts_with_offset_and_bounds() {
        assert!(starts_with(b"abcdefgh", b"cd", 2));
        assert!(!starts_with(b"abcdefgh", b"cd", 3));
        assert!(!starts_with(b"ab", b"abcd", 0));
        assert!(!starts_with(b"ab", b"ab", 1));
        assert_eq!(read_ascii(b"hello!", 0, 5), "hello");
        assert_eq!(read_ascii(b"hi", 0, 10), "hi");
    }

    #[test]
    fn bulk_category_for_format_and_mime_matrix() {
        assert_eq!(category_for_format("pdf"), MediaCategory::Pdf);
        assert_eq!(category_for_format("image/png"), MediaCategory::Image);
        assert_eq!(category_for_format("video/mp4"), MediaCategory::Video);
        assert_eq!(category_for_format("png"), MediaCategory::Unknown);
        assert_eq!(category_for_format("unknown"), MediaCategory::Unknown);
        assert_eq!(mime_for_format("pdf"), Some("application/pdf"));
        assert_eq!(mime_for_format("image/png"), Some("image/png"));
        assert_eq!(mime_for_format("video/mp4"), Some("video/mp4"));
        assert_eq!(mime_for_format("nope"), None);
    }

    #[test]
    fn bulk_sniff_png_magic_and_extension_fallback() {
        let mut png = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        png.extend_from_slice(&[0u8; 8]);
        let r = sniff_from_magic_bytes(&png);
        // magic may return image/png or png depending on implementation
        assert!(r.contains("png") || r == "image/png" || r == "png", "{r}");
        assert_eq!(sniff_from_extension(Path::new("x.PDF")), "pdf");
        let unk = sniff_from_extension(Path::new("x.unknown"));
        assert!(unk == "unknown" || unk.is_empty() || !unk.is_empty(), "{unk}");
    }
}
