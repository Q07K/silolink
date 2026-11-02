use serde_json::{Value, json};
use std::fmt;

#[derive(Debug, Clone)]
pub struct Error {
    pub code: &'static str,
    pub message: String,
    pub details: Value,
}
pub type Result<T> = std::result::Result<T, Error>;
impl Error {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            details: json!({}),
        }
    }
    pub fn details(mut self, value: Value) -> Self {
        self.details = value;
        self
    }
    pub fn json(&self) -> Value {
        let mut value = json!({"code":self.code,"message":self.message});
        if let Some(details) = self.details.as_object() {
            for (key, detail) in details {
                value[key] = detail.clone();
            }
        }
        value
    }
    pub fn io(code: &'static str, message: &str, error: &std::io::Error) -> Self {
        Self::new(code, message).details(json!({"osError":error.raw_os_error()}))
    }
}
impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for Error {}
