use crate::runtime::error;
use silolink::{desktop::FetchedReference, error::Result, project};
use std::{
    net::{IpAddr, SocketAddr},
    time::Duration,
};
use url::{Host, Url};

const MAX_RESPONSE: usize = 2 * 1024 * 1024;

fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            !(ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_documentation()
                || a == 0
                || a >= 224
                || (a == 100 && (64..=127).contains(&b))
                || (a == 192 && b == 0 && c == 0)
                || (a == 198 && (18..=19).contains(&b)))
        }
        IpAddr::V6(ip) => {
            let segments = ip.segments();
            segments[0] & 0xe000 == 0x2000
                && segments[0] != 0x2002
                && !(segments[0] == 0x2001 && (segments[1] < 0x200 || segments[1] == 0xdb8))
        }
    }
}

fn validate_url(value: &str) -> Result<Url> {
    let url = Url::parse(value)
        .map_err(|_| error("INVALID_REFERENCE", "Enter a public HTTPS reference."))?;
    let valid_host = match url.host() {
        Some(Host::Domain(host)) => {
            host.contains('.') && !host.ends_with(".localhost") && host.len() < 254
        }
        Some(Host::Ipv4(ip)) => public_ip(ip.into()),
        Some(Host::Ipv6(ip)) => public_ip(ip.into()),
        None => false,
    };
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || !valid_host
        || value.len() > 4096
    {
        return Err(error(
            "INVALID_REFERENCE",
            "Enter a public HTTPS reference without credentials.",
        ));
    }
    Ok(url)
}

fn extract(url: &str, content_type: &str, bytes: &[u8]) -> Result<FetchedReference> {
    let body = std::str::from_utf8(bytes).map_err(|_| {
        error(
            "REFERENCE_UNSUPPORTED",
            "The reference must use UTF-8 text.",
        )
    })?;
    let media_type = content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_lowercase();
    let (title, text) = match media_type.as_str() {
        "text/html" | "application/xhtml+xml" => {
            let document = dom_query::Document::from(body);
            let title = document.select_single("title").text().trim().to_string();
            document.select("script, style, noscript, iframe, svg, nav, header, footer, form, button, template").remove();
            let main = document.select_single("main, article");
            let text = if main.exists() {
                main.formatted_text()
            } else {
                document.select_single("body").formatted_text()
            };
            (title, text.to_string())
        }
        "text/plain" | "text/markdown" => (url.to_owned(), body.to_owned()),
        _ => {
            return Err(error(
                "REFERENCE_UNSUPPORTED",
                "Choose an HTML or plain-text reference.",
            ));
        }
    };
    let text = text.trim().to_owned();
    if text.is_empty() {
        return Err(error(
            "REFERENCE_UNSUPPORTED",
            "The reference has no readable text.",
        ));
    }
    if text.len() > 100_000 {
        return Err(error(
            "REFERENCE_TOO_LARGE",
            "The extracted reference exceeds 100 KB.",
        ));
    }
    Ok(FetchedReference {
        url: url.into(),
        title: title.chars().take(240).collect(),
        text,
        fetched_at: project::now(),
    })
}

pub async fn fetch(value: &str) -> Result<FetchedReference> {
    tokio::time::timeout(Duration::from_secs(30), fetch_inner(value))
        .await
        .map_err(|_| error("REFERENCE_FETCH_FAILED", "The reference request timed out."))?
}

async fn fetch_inner(value: &str) -> Result<FetchedReference> {
    let mut url = validate_url(value)?;
    for _ in 0..4 {
        let host = url
            .host_str()
            .expect("validated host")
            .trim_matches(['[', ']']);
        let addresses: Vec<SocketAddr> =
            tokio::net::lookup_host((host, url.port_or_known_default().unwrap_or(443)))
                .await
                .map_err(|_| {
                    error(
                        "REFERENCE_FETCH_FAILED",
                        "Cannot resolve the reference host.",
                    )
                })?
                .collect();
        if addresses.is_empty() || addresses.iter().any(|address| !public_ip(address.ip())) {
            return Err(error(
                "INVALID_REFERENCE",
                "Private-network references are not fetched.",
            ));
        }
        let client = reqwest::Client::builder()
            .tls_backend_native()
            .https_only(true)
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .resolve_to_addrs(host, &addresses)
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(15))
            .user_agent(concat!("SiloLink/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|_| error("REFERENCE_FETCH_FAILED", "Cannot initialize HTTPS."))?;
        let mut response = client
            .get(url.clone())
            .send()
            .await
            .map_err(|_| error("REFERENCE_FETCH_FAILED", "Cannot fetch the reference."))?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|header| header.to_str().ok())
                .ok_or_else(|| {
                    error(
                        "REFERENCE_FETCH_FAILED",
                        "The redirect has no valid destination.",
                    )
                })?;
            let next = url
                .join(location)
                .map_err(|_| error("INVALID_REFERENCE", "The redirect destination is invalid."))?;
            url = validate_url(next.as_str())?;
            continue;
        }
        if !response.status().is_success() {
            return Err(error(
                "REFERENCE_FETCH_FAILED",
                "The reference server returned an error.",
            ));
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE as u64)
        {
            return Err(error(
                "REFERENCE_TOO_LARGE",
                "The reference response exceeds 2 MB.",
            ));
        }
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|header| header.to_str().ok())
            .unwrap_or("")
            .to_owned();
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| {
            error(
                "REFERENCE_FETCH_FAILED",
                "The reference download was interrupted.",
            )
        })? {
            if bytes.len() + chunk.len() > MAX_RESPONSE {
                return Err(error(
                    "REFERENCE_TOO_LARGE",
                    "The reference response exceeds 2 MB.",
                ));
            }
            bytes.extend_from_slice(&chunk);
        }
        return extract(url.as_str(), &content_type, &bytes);
    }
    Err(error(
        "REFERENCE_FETCH_FAILED",
        "The reference exceeded its redirect limit.",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_original_text_without_executing_or_retaining_active_content() {
        let body = b"<html><head><title>Reference &amp; guide</title></head><body><nav>Navigation</nav><article><h1>Decision</h1><p>Retry <b>conditions</b>.</p><script>SECRET_SCRIPT</script><style>SECRET_STYLE</style></article></body></html>";
        let reference =
            extract("https://example.org/doc", "text/html; charset=utf-8", body).unwrap();
        assert_eq!(reference.title, "Reference & guide");
        assert!(reference.text.contains("Retry conditions."));
        assert!(!reference.text.contains("SECRET") && !reference.text.contains("Navigation"));
        assert!(extract("https://example.org/", "application/pdf", b"%PDF").is_err());
        assert!(
            extract(
                "https://example.org/",
                "text/html",
                b"<script>nothing</script>"
            )
            .is_err()
        );
    }

    #[test]
    fn rejects_private_networks_credentials_and_unsupported_urls() {
        for url in [
            "file:///C:/private",
            "http://example.org",
            "https://user:password@example.org",
            "https://localhost/x",
            "https://127.0.0.1",
            "https://[::1]",
        ] {
            assert!(validate_url(url).is_err(), "{url}");
        }
        for ip in [
            "10.0.0.1",
            "169.254.169.254",
            "100.64.0.1",
            "198.18.0.1",
            "224.0.0.1",
            "::ffff:127.0.0.1",
            "2001:db8::1",
            "fc00::1",
        ] {
            assert!(!public_ip(ip.parse().unwrap()), "{ip}");
        }
        assert!(public_ip("1.1.1.1".parse().unwrap()));
        assert!(public_ip("2606:4700:4700::1111".parse().unwrap()));
        assert!(validate_url("https://example.org/reference").is_ok());
    }
}
