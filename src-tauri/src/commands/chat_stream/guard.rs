// chat_stream/guard.rs — endpoint 校验（SSRF / 密钥外发防护，B6 第五件原样搬出）
//
// `fetch_models.rs` 也用它（`crate::commands::chat_stream::validate_endpoint`），
// 所以 chat_stream.rs 里保留了一条 `pub(crate) use` 再导出，外部路径不变。

/// 校验 API endpoint（P0-2 安全：防 SSRF 与密钥外发）
///
/// 规则：
/// - 协议仅允许 http/https
/// - 禁止 link-local（169.254.0.0/16，含云元数据 169.254.169.254）、
///   IPv6 link-local（fe80::/10）、保留/组播/广播地址
/// - 回环（127.0.0.0/8、::1）与私网（10/8、172.16/12、192.168/16）默认禁止，
///   仅当 `allow_private` 为 true（前端识别为本地/局域网模型）时放行
/// - 域名（如 api.openai.com）始终允许；DNS 重绑定属残余风险（纵深防御）
pub(crate) fn validate_endpoint(
    endpoint: &str,
    allow_private: bool,
) -> Result<(), String> {
    // 归一化后再判定：用与 reqwest 相同的 WHATWG 解析器（url crate）取真实主机。
    //
    // 旧实现按「原始字符串」判定，而底层 reqwest 会把备选 IPv4 表示归一化，
    // 两者不一致即造成绕过：http://2852039166/ 、http://0x7f000001/ 、http://127.1/
    // 等既无法被 Ipv4Addr::parse 识别（点分十进制之外的形式），又不含冒号进不了
    // IPv6 分支，于是直落 Ok(()) 放行 —— 而底层实际访问的是 169.254.169.254 /
    // 127.0.0.1，且会连带把用户的 Authorization 头外发。
    // 协议白名单先行：保证错误信息准确（file:// 之类应报「协议」而非「缺主机名」）
    let scheme = endpoint
        .split_once("://")
        .map(|(s, _)| s)
        .ok_or_else(|| "endpoint 必须包含协议（如 https://）".to_string())?;
    if scheme != "http" && scheme != "https" {
        return Err(format!("endpoint 协议仅支持 http/https，收到：{scheme}"));
    }

    // authority 非空浅检查：WHATWG 解析器会把 "https:///path" 容错成
    // "https://path/"（host="path"），对用户笔误不够友好，故保留原行为直接报错。
    let authority = endpoint
        .split_once("://")
        .map(|(_, rest)| rest.split(['/', '?', '#']).next().unwrap_or(rest))
        .unwrap_or("");
    if authority.is_empty() {
        return Err("endpoint 缺少主机名".to_string());
    }

    // 归一化：用与 reqwest 相同的 WHATWG 解析器取真实主机
    let parsed = reqwest::Url::parse(endpoint)
        .map_err(|_| "endpoint 必须包含协议（如 https://）".to_string())?;

    let host_raw = parsed
        .host_str()
        .ok_or_else(|| "endpoint 缺少主机名".to_string())?;

    // url crate 对 IPv6 字面量的 host_str() **带方括号**（如 "[fe80::1]"），
    // 而 Ipv6Addr::parse 只接受不带括号的形式 —— 不剥离会解析失败、
    // 直接跳过检查，IPv6 侧等于完全不设防（实测确认）。
    let host = host_raw
        .strip_prefix('[')
        .and_then(|s| s.strip_suffix(']'))
        .unwrap_or(host_raw);

    // 空主机（如 "https:///path"）必须拒绝
    if host.is_empty() {
        return Err("endpoint 缺少主机名".to_string());
    }

    // url crate 已把备选 IPv4 表示（十进制整数 / 十六进制 / 八进制 / 短式）与
    // IPv6 字面量规范化为标准形式，此处直接按地址判定即可。
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        check_ip(ip, allow_private)?;
    }
    // 域名（如 api.openai.com）始终允许；DNS 重绑定属残余风险（纵深防御）

    Ok(())
}

/// 按地址族分派判定。
///
/// IPv4-mapped IPv6（`::ffff:a.b.c.d`）必须先还原成 IPv4 再判定，
/// 否则 `::ffff:169.254.169.254` 会绕过 link-local 检查。
fn check_ip(ip: std::net::IpAddr, allow_private: bool) -> Result<(), String> {
    match ip {
        std::net::IpAddr::V4(v4) => check_ipv4(v4, allow_private),
        std::net::IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => check_ipv4(v4, allow_private),
            None => check_ipv6(v6, allow_private),
        },
    }
}

fn check_ipv4(ip: std::net::Ipv4Addr, allow_private: bool) -> Result<(), String> {
    let o = ip.octets();
    // link-local（169.254.0.0/16，含云元数据 169.254.169.254）
    if o[0] == 169 && o[1] == 254 {
        return Err("禁止访问 link-local 地址（169.254.0.0/16，含云元数据）".to_string());
    }
    // 未指定 / 保留 / 组播 / 广播
    if ip.is_unspecified() || o[0] == 0 || (224..=239).contains(&o[0]) || ip.is_broadcast() {
        return Err("禁止访问保留/组播/广播地址".to_string());
    }
    // CGNAT（100.64.0.0/10，RFC 6598）与基准测试网段（198.18.0.0/15，RFC 2544）
    if (o[0] == 100 && (64..=127).contains(&o[1])) || (o[0] == 198 && (18..=19).contains(&o[1])) {
        return Err("禁止访问保留地址段（100.64.0.0/10、198.18.0.0/15）".to_string());
    }
    // 回环（127.0.0.0/8）与私网（10/8、172.16/12、192.168/16）
    if (ip.is_loopback() || ip.is_private()) && !allow_private {
        return Err(
            "禁止访问回环/内网地址；本地或局域网模型请在客户端勾选「允许本地模型」".to_string(),
        );
    }
    Ok(())
}

fn check_ipv6(ip: std::net::Ipv6Addr, allow_private: bool) -> Result<(), String> {
    // link-local fe80::/10
    if (ip.segments()[0] & 0xffc0) == 0xfe80 {
        return Err("禁止访问 IPv6 link-local 地址（fe80::/10）".to_string());
    }
    // 未指定地址 ::/128
    if ip.is_unspecified() {
        return Err("禁止访问 IPv6 未指定地址（::/128）".to_string());
    }
    // 回环 ::1 与唯一本地地址 fc00::/7
    let is_private = ip.is_loopback() || (ip.segments()[0] & 0xfe00) == 0xfc00;
    if is_private && !allow_private {
        return Err(
            "禁止访问 IPv6 回环/内网地址；本地模型请在客户端勾选「允许本地模型」".to_string(),
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_endpoint_allows_public_https() {
        assert!(validate_endpoint("https://api.openai.com/v1/chat/completions", false).is_ok());
    }

    #[test]
    fn test_validate_endpoint_rejects_cloud_metadata() {
        let err = validate_endpoint("http://169.254.169.254/latest/meta-data", false)
            .unwrap_err();
        assert!(err.contains("link-local"), "{err}");
    }

    #[test]
    fn test_validate_endpoint_rejects_non_http_scheme() {
        let err = validate_endpoint("file:///etc/passwd", false).unwrap_err();
        assert!(err.contains("协议"), "{err}");
    }

    #[test]
    fn test_validate_endpoint_rejects_loopback_by_default() {
        let err = validate_endpoint("http://127.0.0.1:11434/v1/chat/completions", false)
            .unwrap_err();
        assert!(err.contains("回环"), "{err}");
    }

    #[test]
    fn test_validate_endpoint_allows_loopback_with_flag() {
        assert!(validate_endpoint("http://127.0.0.1:11434/v1/chat/completions", true).is_ok());
    }

    #[test]
    fn test_validate_endpoint_rejects_private_network_by_default() {
        let err = validate_endpoint("http://192.168.1.10:8080/v1", false).unwrap_err();
        assert!(err.contains("内网"), "{err}");
        let err2 = validate_endpoint("http://10.0.0.5:8080/v1", false).unwrap_err();
        assert!(err2.contains("内网"), "{err2}");
        let err3 = validate_endpoint("http://172.16.0.1:8080/v1", false).unwrap_err();
        assert!(err3.contains("内网"), "{err3}");
    }

    #[test]
    fn test_validate_endpoint_rejects_multicast_and_broadcast() {
        assert!(validate_endpoint("http://224.0.0.1/x", false).is_err());
        assert!(validate_endpoint("http://255.255.255.255/x", false).is_err());
    }

    #[test]
    fn test_validate_endpoint_rejects_ipv6_link_local() {
        let err = validate_endpoint("http://[fe80::1]:8080/v1", false).unwrap_err();
        assert!(err.contains("link-local"), "{err}");
    }

    #[test]
    fn test_validate_endpoint_rejects_missing_scheme_and_host() {
        assert!(validate_endpoint("api.openai.com/v1", false).is_err());
        assert!(validate_endpoint("https:///path", false).is_err());
    }

    #[test]
    fn test_validate_endpoint_private_with_flag_ok() {
        assert!(validate_endpoint("http://192.168.0.2:5000/v1", true).is_ok());
    }

    #[test]
    fn test_validate_endpoint_rejects_alternative_ipv4_notations() {
        // 这些写法旧实现一律放行：Ipv4Addr::parse 只认点分十进制，而它们又不含
        // 冒号进不了 IPv6 分支 —— 但 reqwest 底层会归一化成 169.254.169.254 /
        // 127.0.0.1，于是校验被绕过且 Authorization 头一并外发。
        for ep in [
            "http://2852039166/latest/meta-data",   // 169.254.169.254 十进制整数形式
            "http://0xA9FEA9FE/latest/meta-data",   // 十六进制
            "http://025177524776/latest/meta-data", // 八进制（= 2852039166）
            "http://2130706433/",                   // 127.0.0.1 十进制整数形式
            "http://0x7f000001/",                   // 127.0.0.1 十六进制
            "http://0177.0.0.1/",                   // 127.0.0.1 八进制点分
            "http://127.1/",                        // 127.0.0.1 短式
        ] {
            let result = validate_endpoint(ep, false);
            assert!(result.is_err(), "应当拒绝但放行了：{ep}");
            let err = result.unwrap_err();
            assert!(
                err.contains("link-local") || err.contains("回环") || err.contains("内网"),
                "{ep} -> {err}"
            );
        }
    }

    #[test]
    fn test_validate_endpoint_rejects_ipv4_mapped_ipv6() {
        // ::ffff:a.b.c.d 若不做还原，会绕过 link-local / 回环检查
        for ep in [
            "http://[::ffff:169.254.169.254]/latest/meta-data",
            "http://[::ffff:a9fe:a9fe]/latest/meta-data",
            "http://[::ffff:127.0.0.1]/",
        ] {
            let result = validate_endpoint(ep, false);
            assert!(result.is_err(), "应当拒绝 IPv4-mapped 但放行了：{ep}");
        }
    }

    #[test]
    fn test_validate_endpoint_rejects_unspecified_and_new_ranges() {
        // ::/128 未指定地址
        assert!(validate_endpoint("http://[::]/", false).is_err());
        // CGNAT 100.64.0.0/10（RFC 6598）
        assert!(validate_endpoint("http://100.64.0.1/", false).is_err());
        assert!(validate_endpoint("http://100.127.255.255/", false).is_err());
        // 基准测试网段 198.18.0.0/15（RFC 2544）
        assert!(validate_endpoint("http://198.18.0.1/", false).is_err());
        assert!(validate_endpoint("http://198.19.255.255/", false).is_err());
    }

    #[test]
    fn test_validate_endpoint_alternative_notation_respects_allow_private() {
        // 勾选「允许本地模型」后备选表示应正常放行（否则会误伤本地部署）
        assert!(validate_endpoint("http://127.1:11434/v1", true).is_ok());
        assert!(validate_endpoint("http://2130706433:11434/v1", true).is_ok());
        // 但 link-local 永远拒绝，不受 allow_private 影响
        assert!(validate_endpoint("http://2852039166/latest/meta-data", true).is_err());
        assert!(
            validate_endpoint("http://[::ffff:169.254.169.254]/latest/meta-data", true).is_err()
        );
    }

    #[test]
    fn test_validate_endpoint_still_allows_normal_public_hosts() {
        // 防过度拦截：正常公网目标必须照旧放行
        assert!(validate_endpoint("https://api.openai.com/v1/chat/completions", false).is_ok());
        assert!(validate_endpoint("https://api.anthropic.com/v1/messages", false).is_ok());
        assert!(validate_endpoint("https://8.8.8.8/v1", false).is_ok());
        assert!(validate_endpoint("https://example.com:8443/v1", false).is_ok());
        assert!(validate_endpoint("http://198.20.0.1/v1", false).is_ok());
    }
}
