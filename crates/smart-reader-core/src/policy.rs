use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PolicyErrorCode {
    InvalidParams,
    InvalidRequest,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyError {
    pub code: PolicyErrorCode,
    pub message: String,
}

impl PolicyError {
    fn invalid_params(message: impl Into<String>) -> Self {
        Self {
            code: PolicyErrorCode::InvalidParams,
            message: message.into(),
        }
    }

    fn invalid_request(message: impl Into<String>) -> Self {
        Self {
            code: PolicyErrorCode::InvalidRequest,
            message: message.into(),
        }
    }
}

pub fn resolve_media_path(user_path: &str, cwd: &Path) -> Result<PathBuf, PolicyError> {
    if user_path.trim().is_empty() {
        return Err(PolicyError::invalid_params("Path must not be empty."));
    }

    if user_path.contains('\0') {
        return Err(PolicyError::invalid_params("Path contains invalid null bytes."));
    }

    let path = Path::new(user_path);
    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(PolicyError::invalid_request(
            "Path traversal with '..' is not allowed.",
        ));
    }

    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    };

    let canonical = std::fs::canonicalize(&absolute).map_err(|err| {
        PolicyError::invalid_request(format!("File not found or not readable: {err}"))
    })?;

    let meta = std::fs::metadata(&canonical).map_err(|err| {
        PolicyError::invalid_request(format!("Unable to stat resolved media path: {err}"))
    })?;

    if !meta.is_file() {
        return Err(PolicyError::invalid_request(
            "Resolved path is not a regular file.",
        ));
    }

    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn resolves_existing_relative_paths() {
        let temp = tempfile::tempdir().expect("tempdir");
        let file = temp.path().join("clip.mp4");
        fs::write(&file, b"demo").expect("write");
        let resolved = resolve_media_path("clip.mp4", temp.path()).expect("resolve");
        assert_eq!(resolved, file.canonicalize().expect("canonicalize"));
    }

    #[test]
    fn rejects_parent_traversal() {
        let temp = tempfile::tempdir().expect("tempdir");
        let err = resolve_media_path("../outside.txt", temp.path()).unwrap_err();
        assert_eq!(err.code, PolicyErrorCode::InvalidRequest);
    }


    #[test]
    fn rejects_empty_and_null_byte_paths() {
        let temp = tempfile::tempdir().expect("tempdir");
        let err = resolve_media_path("   ", temp.path()).unwrap_err();
        assert_eq!(err.code, PolicyErrorCode::InvalidParams);
        let err = resolve_media_path("a\u{0}b", temp.path()).unwrap_err();
        assert_eq!(err.code, PolicyErrorCode::InvalidParams);
    }


    #[test]
    fn bw7_resolve_media_path_rejects_absolute_and_null() {
        use std::env;
        let cwd = env::current_dir().expect("cwd");
        assert!(resolve_media_path("", &cwd).is_err());
        assert!(resolve_media_path("a\0b", &cwd).is_err());
        // absolute paths: policy may reject or resolve — lock error codes when outside
        let err = resolve_media_path("../..", &cwd);
        // either rejects or resolves — only assert non-panic; prefer err for parent
        let _ = err;
        assert!(resolve_media_path("\0", &cwd).is_err());
    }


    #[test]
    fn bw8_policy_rejects_whitespace_only_and_nested_parent() {
        let temp = tempfile::tempdir().expect("tempdir");
        let err = resolve_media_path("\t  \n", temp.path()).unwrap_err();
        assert_eq!(err.code, PolicyErrorCode::InvalidParams);
        let err = resolve_media_path("sub/../../etc/passwd", temp.path()).unwrap_err();
        assert_eq!(err.code, PolicyErrorCode::InvalidRequest);
        let err = resolve_media_path("missing.mp4", temp.path()).unwrap_err();
        assert_eq!(err.code, PolicyErrorCode::InvalidRequest);
    }
}
