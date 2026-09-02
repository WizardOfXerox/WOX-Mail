---
name: anthropic-cybersecurity-skills
description: Comprehensive cybersecurity skills library for AI agents mapped across MITRE ATT&CK, NIST CSF 2.0, D3FEND, and MITRE F3 frameworks. Use for vulnerability auditing, threat hunting, secure code review, and anti-abuse defense.
---

# Anthropic Cybersecurity Skills Framework

## Overview
Structured security practices covering 29 security domains mapped to MITRE ATT&CK, NIST CSF 2.0, and D3FEND defensive countermeasures.

## Core Directives for WoxMail & Mail Platforms

### 1. Initial Access & Authentication Hardening (TA0001 / TA0006)
- **Zero Hardcoded Secrets**: Absolutely no default passwords, hardcoded API tokens, or static email addresses in source files. All secrets must resolve dynamically from environment variables.
- **Strict Parameterized Queries**: Every SQL query must use `$1, $2, ...` placeholders to eliminate SQL injection attack surface.
- **Argon2id Key Derivation**: High memory-hardness and iteration limits for password hashes and 2FA secrets.
- **CSRF Token Enforcement**: Every state-modifying endpoint (`POST`, `PUT`, `DELETE`, `PATCH`) must validate high-entropy CSRF tokens and SameSite session cookies.

### 2. Information Disclosure & Privacy Shield (TA0010 / TA0005)
- **Header Stripping**: Outbound SMTP transmissions must purge originating client IPs (`X-Originating-IP`), hostnames, and browser telemetry.
- **Zero-Knowledge Ephemeral Streams**: 1-time view tokens must immediately wipe ciphertext (`[BURNED]`) from persistent storage upon consumption.
- **Crawler & Proxy Defense**: Detect automated scanners (`GoogleImageProxy`, security transcoders) and apply proxy-aware grace window logic to prevent premature message burning.

### 3. Anti-Abuse & Rate Limiting (TA0040 / D3-NTA)
- **Tiered Rate Limiters**: Enforce window-based throttling on authentication attempts, account generation, and public endpoints.
- **Safe Attachment Sandboxing**: Scan and block executable extensions (`.exe`, `.scr`, `.bat`, `.vbs`, `.js`, `.cmd`) and isolate inline HTML frames with `sandbox="allow-same-origin"`.
