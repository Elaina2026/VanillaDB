# Schema Markup Detection & Validation Report

**Domain:** `https://vanilladatabase.elaina2026.io.vn/`  
**Page Inspected:** `index.html` (Homepage & Platform Root)  
**Standard Evaluated:** Google Search Central Structured Data & Schema.org Specification (Active as of June 2026)  
**Format:** JSON-LD (`<script type="application/ld+json">`)

---

## 1. Detection Results

| Format | Detected | Count | Notes |
|:---|:---:|:---:|:---|
| **JSON-LD** | ✅ Yes | 3 Entities | Injected directly in `<head>` server-side |
| **Microdata** | ❌ No | 0 | Not used (JSON-LD preferred by Google) |
| **RDFa** | ❌ No | 0 | Not used |

---

## 2. Validation Results

| Schema Entity | @type | Rich Result Eligibility | Validation Status | Issues Found |
|:---|:---|:---:|:---:|:---|
| **WebSite** | `WebSite` | Sitelinks Search Box / Knowledge Graph | ✅ Valid | None. Has `@id`, `url`, `publisher`, `inLanguage`. |
| **Software** | `SoftwareApplication` | App Cards / Software Snippets | ✅ Valid | None. Has `operatingSystem`, `applicationCategory`, `offers`, `featureList`, `screenshot`. |
| **Organization**| `Organization` | Knowledge Panel / Entity Trust | ✅ Valid | None. Has `name`, `url`, `logo` (`ImageObject`), `sameAs` (GitHub). |

---

## 3. Compliance with 2026 Search Standards

1. **Pre-rendered JSON-LD (Google Dec 2025 JS SEO Guidance):**
   - Structured data is present in the initial static HTML document, not injected dynamically via client-side React hooks. This prevents delayed indexing and missing rich results.
2. **Entity Graph Disambiguation:**
   - Uses Schema.org `@graph` syntax with explicit `@id` URIs (`#website`, `#software`, `#organization`), linking publisher and author relationships cleanly without circular references.
3. **No Deprecated Types:**
   - Deprecated schemas (`HowTo`, `SpecialAnnouncement`, `CourseInfo`, `ClaimReview`) are completely avoided.
   - Deprecated FAQPage rich results (retired May 2026) are not used.

---

## 4. Generated Artifacts
- Ready-to-use snippet file: `generated-schema.json`
- Injected into project root: `index.html`
