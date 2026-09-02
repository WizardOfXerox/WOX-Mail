---
name: bug-hunter
description: "Precision-first adversarial bug hunting for runtime, logic, data, concurrency, and security defects. Uses deterministic risk triage, evidence-bounded retrieval, Hunter/Skeptic/Referee review, optional hybrid verification, and explicit immutable Fixer scope. Scan-only and single-pass by default; complete-coverage loops, edits, autonomous fixes, and commits each require explicit intent. Use for code review, security audits, regression hunting, PR review, and evidence-backed remediation planning."
---

# Bug Hunter — Adversarial AI Bug Hunter & Auto-Fix Skill

Bug Hunter enforces separation of **scope**, **evidence**, **verdicts**, and **mutation authority** to maximize verified real bugs found while eliminating hallucinations and false positives.

```text
Deterministic Triage
  -> Recon (Boundary & Invariant Mapping)
  -> Hunter (Hypothesis Generation)
  -> Skeptic (Adversarial Challenge & Proof of Exploitability)
  -> Referee (Definitive Verdict & Remediation Mandate)
  -> Fixer (Scoped, Minimal Mutation & Test Verification)
```

## Core Protocol:
1. **Zero Guessing**: Claims must have file paths, exact line numbers, and verifiable execution paths.
2. **Hunter Proposes**: Identifies suspicious patterns, concurrency race conditions, memory leaks, unhandled exceptions, and injection risks.
3. **Skeptic Challenges**: Attempts to prove the bug is invalid or already guarded.
4. **Referee Decides**: Authorizes verified findings and establishes immutable boundaries for the fix.
5. **Fixer Applies**: Minimal, regression-free code remediation with test validation.
