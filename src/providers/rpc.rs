use crate::error::{Error, Result};
use serde_json::{Value, json};
use std::{ffi::OsStr, process::Stdio, time::Duration};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    time::timeout,
};

pub struct Rpc {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    sequence: u64,
    timeout: Duration,
    failed: bool,
}
impl Rpc {
    pub async fn connect() -> Result<Self> {
        let program =
            std::env::var_os("SILOLINK_CODEX_EXECUTABLE").unwrap_or_else(|| "codex".into());
        Self::connect_with(
            &program,
            &["app-server", "--stdio"],
            Duration::from_secs(15),
        )
        .await
    }
    pub async fn connect_with(program: &OsStr, args: &[&str], duration: Duration) -> Result<Self> {
        let mut command = Command::new(program);
        command.args(args);
        Self::connect_command(command, duration).await
    }
    pub async fn connect_command(mut command: Command, duration: Duration) -> Result<Self> {
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let mut child = command.spawn().map_err(|_| {
            Error::new("PROVIDER_UNAVAILABLE", "Cannot start the Codex executable.")
        })?;
        let stdin = child.stdin.take();
        let stdout = BufReader::new(child.stdout.take().expect("piped stdout"));
        let mut rpc = Self {
            child,
            stdin,
            stdout,
            sequence: 0,
            timeout: duration.max(Duration::from_secs(1)),
            failed: false,
        };
        if let Err(error)=rpc.request("initialize",json!({"clientInfo":{"name":"silolink","title":"SiloLink","version":env!("CARGO_PKG_VERSION")}})).await {rpc.close().await;return Err(error);}
        rpc.write(&json!({"method":"initialized","params":{}}))
            .await?;
        rpc.timeout = duration;
        Ok(rpc)
    }
    async fn write(&mut self, value: &Value) -> Result<()> {
        let mut bytes = serde_json::to_vec(value).expect("RPC JSON");
        bytes.push(b'\n');
        self.stdin
            .as_mut()
            .ok_or_else(|| Error::new("PROVIDER_CLOSED", "The Codex connection is closed."))?
            .write_all(&bytes)
            .await
            .map_err(|_| Error::new("PROVIDER_CLOSED", "The Codex input stream closed."))
    }
    async fn frame(&mut self) -> Result<Value> {
        let mut bytes = Vec::new();
        loop {
            let chunk = self.stdout.fill_buf().await.map_err(|_| {
                Error::new("PROVIDER_CLOSED", "Cannot read the Codex output stream.")
            })?;
            if chunk.is_empty() {
                return Err(Error::new(
                    "PROVIDER_EXITED",
                    "The Codex process ended before completing the request.",
                ));
            }
            let end = chunk.iter().position(|b| *b == b'\n');
            let consumed = end.map(|n| n + 1).unwrap_or(chunk.len());
            if bytes.len() + consumed > 16 * 1024 * 1024 {
                self.failed = true;
                return Err(Error::new(
                    "INVALID_PROVIDER_PROTOCOL",
                    "Codex returned oversized JSON.",
                ));
            }
            bytes.extend_from_slice(&chunk[..consumed]);
            self.stdout.consume(consumed);
            if end.is_some() {
                break;
            }
        }
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|_| Error::new("INVALID_PROVIDER_PROTOCOL", "Codex returned invalid JSON."))?;
        if !value.is_object() {
            self.failed = true;
            return Err(Error::new(
                "INVALID_PROVIDER_PROTOCOL",
                "Codex returned a non-object response.",
            ));
        }
        Ok(value)
    }
    pub async fn request(&mut self, method: &str, params: Value) -> Result<Value> {
        if self.failed {
            return Err(Error::new(
                "PROVIDER_CLOSED",
                "The Codex connection is unusable.",
            ));
        }
        self.sequence += 1;
        let id = self.sequence;
        let duration = self.timeout;
        let result = timeout(duration, async {
            self.write(&json!({"id":id,"method":method,"params":params}))
                .await?;
            loop {
                let response = self.frame().await?;
                if response["id"] != id {
                    continue;
                }
                if let Some(error) = response.get("error") {
                    return Err(Error::new(
                        "PROVIDER_RPC_ERROR",
                        format!("Codex rejected {method}."),
                    )
                    .details(json!({"method":method,"rpcCode":error["code"]})));
                }
                return response.get("result").cloned().ok_or_else(|| {
                    Error::new(
                        "INVALID_PROVIDER_PROTOCOL",
                        "Codex returned a response without a result.",
                    )
                });
            }
        })
        .await;
        match result {
            Ok(result) => {
                if result
                    .as_ref()
                    .is_err_and(|e| e.code == "INVALID_PROVIDER_PROTOCOL")
                {
                    self.failed = true;
                }
                result
            }
            Err(_) => {
                self.failed = true;
                Err(Error::new(
                    "PROVIDER_TIMEOUT",
                    format!("Codex timed out while handling {method}."),
                )
                .details(json!({"method":method,"timeoutMs":duration.as_millis()})))
            }
        }
    }
    pub async fn close(&mut self) {
        self.stdin.take();
        if timeout(Duration::from_millis(1500), self.child.wait())
            .await
            .is_err()
        {
            let _ = self.child.kill().await;
            let _ = self.child.wait().await;
        }
        self.failed = true;
    }
}
